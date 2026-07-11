import type { ChatMessage } from '../types'
import type { ChatStore, Conversation, ConversationMeta } from './store'

/**
 * IndexedDB-backed ChatStore. Metadata and message bodies live in separate
 * object stores (a normalized shape that maps cleanly to SQLite tables later),
 * so the sidebar can list chats without deserializing every message.
 */

const DB_NAME = 'irisui'
const DB_VERSION = 4
export const META = 'conversations'
export const MSGS = 'messages'
export const STATS = 'stats'
export const KBS = 'kbs'
export const CHUNKS = 'chunks'
export const PERSONAS = 'personas'
export const PROMPTS = 'prompts'

/** Every object store — used to enumerate/wipe everything for backup + "Delete all data". */
export const STORE_NAMES: string[] = [META, MSGS, STATS, KBS, CHUNKS, PERSONAS, PROMPTS]

interface MsgRecord {
  id: string
  items: ChatMessage[]
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(MSGS)) db.createObjectStore(MSGS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STATS)) db.createObjectStore(STATS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(KBS)) db.createObjectStore(KBS, { keyPath: 'id' })

      const chunksStore = db.objectStoreNames.contains(CHUNKS)
        ? req.transaction!.objectStore(CHUNKS)
        : db.createObjectStore(CHUNKS, { keyPath: 'id' })
      if (!chunksStore.indexNames.contains('kbId')) chunksStore.createIndex('kbId', 'kbId')

      if (!db.objectStoreNames.contains(PERSONAS)) db.createObjectStore(PERSONAS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(PROMPTS)) db.createObjectStore(PROMPTS, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getAllMeta(db: IDBDatabase): Promise<ConversationMeta[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(META, 'readonly').objectStore(META).getAll()
    req.onsuccess = () => resolve(req.result as ConversationMeta[])
    req.onerror = () => reject(req.error)
  })
}

function getOne<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

export function createIdbStore(): ChatStore {
  let dbp: Promise<IDBDatabase> | null = null
  const getDB = () => (dbp ??= openDB())

  return {
    async listMeta() {
      const db = await getDB()
      const metas = await getAllMeta(db)
      return metas.sort((a, b) => b.updatedAt - a.updatedAt)
    },

    async get(id) {
      const db = await getDB()
      const [meta, msgs] = await Promise.all([
        getOne<ConversationMeta>(db, META, id),
        getOne<MsgRecord>(db, MSGS, id),
      ])
      if (!meta) return null
      return { ...meta, messages: msgs?.items ?? [] }
    },

    async put(conv: Conversation) {
      const db = await getDB()
      const { messages, ...meta } = conv
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction([META, MSGS], 'readwrite')
        t.objectStore(META).put(meta)
        t.objectStore(MSGS).put({ id: conv.id, items: messages } satisfies MsgRecord)
        t.oncomplete = () => resolve()
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      })
    },

    async remove(id) {
      const db = await getDB()
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction([META, MSGS], 'readwrite')
        t.objectStore(META).delete(id)
        t.objectStore(MSGS).delete(id)
        t.oncomplete = () => resolve()
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      })
    },
  }
}

// ── generic store helpers ────────────────────────────────────────────────
// Bypass the per-store, per-shape helpers above; used by backup.ts (export /
// import / delete-all), which treats every store as an opaque bag of records.

/** Bulk read every record in `store`. */
export function getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

/** Bulk upsert `items` into `store` (each item's keyPath id wins ties). */
export function putAll(db: IDBDatabase, store: string, items: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite')
    const os = t.objectStore(store)
    for (const item of items) os.put(item)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

/** Clear every object store — the IndexedDB half of "Delete all data". */
export function clearAllStores(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAMES, 'readwrite')
    for (const name of STORE_NAMES) t.objectStore(name).clear()
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}
