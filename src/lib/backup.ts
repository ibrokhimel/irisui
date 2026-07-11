import type { Conversation } from './store'
import { getStore } from './store'
import type { GenerationStat } from './stats'
import type { KnowledgeBase, StoredChunk } from './kbStore'
import type { Persona, PromptItem } from './studioStore'
import { CHUNKS, KBS, PERSONAS, PROMPTS, STATS, clearAllStores, getAll, openDB, putAll } from './idbStore'
import { STORAGE_KEY as THEME_KEY } from '../theme'
import { KEY as MODEL_PREFS_KEY } from './modelPrefs'
import { KEY as SETTINGS_KEY } from './appSettings'

/**
 * Full local backup/restore: everything IrisUI persists (conversations via
 * the existing ChatStore abstraction, plus the IndexedDB-backed stats/KB/
 * persona/prompt stores and the theme/model-prefs/settings localStorage
 * keys) rolled into one importable/exportable JSON document.
 */

export const BACKUP_VERSION = 1

/** localStorage keys folded into the backup (theme, model prefs, app settings). */
const BACKUP_LOCAL_STORAGE_KEYS = [THEME_KEY, MODEL_PREFS_KEY, SETTINGS_KEY]

/** Prefix swept on "Delete all data" — broader than the backed-up key list on purpose. */
const APP_KEY_PREFIX = 'irisui.'

export interface BackupFile {
  version: number
  exportedAt: number
  conversations: Conversation[]
  stats: GenerationStat[]
  kbs: KnowledgeBase[]
  chunks: StoredChunk[]
  personas: Persona[]
  prompts: PromptItem[]
  localStorage: Record<string, string>
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export async function exportAll(): Promise<BackupFile> {
  const store = getStore()
  const metas = await store.listMeta()
  const loaded = await Promise.all(metas.map((m) => store.get(m.id)))
  const conversations = loaded.filter((c): c is Conversation => c !== null)

  const db = await openDB()
  const [stats, kbs, chunks, personas, prompts] = await Promise.all([
    getAll<GenerationStat>(db, STATS),
    getAll<KnowledgeBase>(db, KBS),
    getAll<StoredChunk>(db, CHUNKS),
    getAll<Persona>(db, PERSONAS),
    getAll<PromptItem>(db, PROMPTS),
  ])

  const localStorageData: Record<string, string> = {}
  for (const key of BACKUP_LOCAL_STORAGE_KEYS) {
    const v = safeGetItem(key)
    if (v !== null) localStorageData[key] = v
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    conversations,
    stats,
    kbs,
    chunks,
    personas,
    prompts,
    localStorage: localStorageData,
  }
}

// ── validation ────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function assertArray(v: unknown, field: string): asserts v is unknown[] {
  if (!Array.isArray(v)) throw new Error(`Invalid backup file: "${field}" must be an array`)
}

function assertRecordsWithId(items: unknown[], field: string): void {
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.length === 0) {
      throw new Error(`Invalid backup file: malformed entry in "${field}"`)
    }
  }
}

/** Validate an unknown value shape before touching any store. Throws on garbage input. */
export function validateBackup(data: unknown): BackupFile {
  if (!isRecord(data)) throw new Error('Invalid backup file: expected a JSON object')
  if (typeof data.version !== 'number') {
    throw new Error('Invalid backup file: missing or invalid "version"')
  }

  assertArray(data.conversations, 'conversations')
  assertArray(data.stats, 'stats')
  assertArray(data.kbs, 'kbs')
  assertArray(data.chunks, 'chunks')
  assertArray(data.personas, 'personas')
  assertArray(data.prompts, 'prompts')
  if (!isRecord(data.localStorage)) {
    throw new Error('Invalid backup file: "localStorage" must be an object')
  }

  for (const c of data.conversations) {
    if (!isRecord(c) || typeof c.id !== 'string' || c.id.length === 0 || !Array.isArray(c.messages)) {
      throw new Error('Invalid backup file: malformed conversation entry')
    }
  }
  assertRecordsWithId(data.stats, 'stats')
  assertRecordsWithId(data.kbs, 'kbs')
  assertRecordsWithId(data.chunks, 'chunks')
  assertRecordsWithId(data.personas, 'personas')
  assertRecordsWithId(data.prompts, 'prompts')
  for (const [k, v] of Object.entries(data.localStorage)) {
    if (typeof v !== 'string') throw new Error(`Invalid backup file: localStorage["${k}"] must be a string`)
  }

  return data as unknown as BackupFile
}

/** Validated, merge-by-id upsert import. Never partially applies a malformed file. */
export async function importAll(data: unknown): Promise<void> {
  const backup = validateBackup(data)

  const store = getStore()
  await Promise.all(backup.conversations.map((c) => store.put(c)))

  const db = await openDB()
  await Promise.all([
    putAll(db, STATS, backup.stats),
    putAll(db, KBS, backup.kbs),
    putAll(db, CHUNKS, backup.chunks),
    putAll(db, PERSONAS, backup.personas),
    putAll(db, PROMPTS, backup.prompts),
  ])

  for (const [key, value] of Object.entries(backup.localStorage)) {
    safeSetItem(key, value)
  }
}

/** Wipe every IndexedDB store and every `irisui.*` localStorage key. Irreversible. */
export async function deleteAllData(): Promise<void> {
  const db = await openDB()
  await clearAllStores(db)
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(APP_KEY_PREFIX)) toRemove.push(key)
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
