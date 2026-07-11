import type { Chunk } from './rag'
import { CHUNKS, KBS, openDB } from './idbStore'
import { isDataWiped } from './backup'

/**
 * IndexedDB persistence for knowledge bases and their embedded chunks.
 * Mirrors statsStore.ts's transaction idiom (oncomplete/onerror/onabort);
 * callers are responsible for handling rejected promises.
 */

export interface KnowledgeBase {
  id: string
  name: string
  createdAt: number
  fileCount: number
  chunkCount: number
  embedModel: string
}

export interface StoredChunk extends Chunk {
  vector: number[]
}

let dbp: Promise<IDBDatabase> | null = null
const getDB = () => (dbp ??= openDB())

export async function listKbs(): Promise<KnowledgeBase[]> {
  const db = await getDB()
  const all = await new Promise<KnowledgeBase[]>((resolve, reject) => {
    const req = db.transaction(KBS, 'readonly').objectStore(KBS).getAll()
    req.onsuccess = () => resolve(req.result as KnowledgeBase[])
    req.onerror = () => reject(req.error)
  })
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function createKb(name: string, embedModel: string): Promise<KnowledgeBase> {
  if (isDataWiped()) throw new Error('Data has been deleted — reload the app')
  const db = await getDB()
  const kb: KnowledgeBase = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    fileCount: 0,
    chunkCount: 0,
    embedModel,
  }
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(KBS, 'readwrite')
    t.objectStore(KBS).put(kb)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
  return kb
}

export async function deleteKb(id: string): Promise<void> {
  const db = await getDB()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([KBS, CHUNKS], 'readwrite')
    t.objectStore(KBS).delete(id)

    const cursorReq = t.objectStore(CHUNKS).index('kbId').openCursor(IDBKeyRange.only(id))
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }

    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

/** Bulk-store `chunks` for `fileName` and bump the kb's fileCount/chunkCount. */
export async function addChunks(
  kbId: string,
  fileName: string,
  chunks: StoredChunk[],
): Promise<void> {
  if (isDataWiped()) return
  const db = await getDB()

  // Look up the kb first: if it doesn't exist, reject and write nothing —
  // otherwise a bogus kbId would silently persist orphaned chunks with no
  // owning kb record (and no fileCount/chunkCount bump to reflect them).
  const kb = await new Promise<KnowledgeBase | undefined>((resolve, reject) => {
    const req = db.transaction(KBS, 'readonly').objectStore(KBS).get(kbId)
    req.onsuccess = () => resolve(req.result as KnowledgeBase | undefined)
    req.onerror = () => reject(req.error)
  })
  if (!kb) throw new Error('Unknown knowledge base')

  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([KBS, CHUNKS], 'readwrite')
    const chunkStore = t.objectStore(CHUNKS)
    for (const c of chunks) chunkStore.put({ ...c, fileName })

    kb.fileCount += 1
    kb.chunkCount += chunks.length
    t.objectStore(KBS).put(kb)

    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export async function getChunks(kbId: string): Promise<StoredChunk[]> {
  const db = await getDB()
  return new Promise<StoredChunk[]>((resolve, reject) => {
    const req = db.transaction(CHUNKS, 'readonly').objectStore(CHUNKS).index('kbId').getAll(kbId)
    req.onsuccess = () => resolve(req.result as StoredChunk[])
    req.onerror = () => reject(req.error)
  })
}
