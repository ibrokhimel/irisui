import type { Conversation } from './store'
import { getStore } from './store'
import type { GenerationStat } from './stats'
import type { KnowledgeBase, StoredChunk } from './kbStore'
import type { Persona, PromptItem } from './studioStore'
import { CHUNKS, KBS, PERSONAS, PROMPTS, STATS, clearAllStores, getAll, openDB, putAll } from './idbStore'
import { STORAGE_KEY as THEME_KEY } from '../theme'
import { KEY as MODEL_PREFS_KEY } from './modelPrefs'
import { KEY as SETTINGS_KEY } from './appSettings'
import { KEY as HARDWARE_KEY } from './hardware'
import type { Effort } from '../types'

/**
 * Set to `true` as the first statement of `deleteAllData`. Guards against the
 * "delete-all resurrection" race: an in-flight chat stream's trailing
 * `persist()` (useChat's `run` finally block) or a stray `addStat()` can
 * still be pending when the user wipes data, and could re-write a
 * conversation/stat into IndexedDB after `clearAllStores()` has run but
 * before `location.reload()` actually reloads the page. Once set, callers
 * that check `isDataWiped()` at the top of their write path no-op instead.
 */
let dataWiped = false
export const isDataWiped = (): boolean => dataWiped

/**
 * Full local backup/restore: everything IrisUI persists (conversations via
 * the existing ChatStore abstraction, plus the IndexedDB-backed stats/KB/
 * persona/prompt stores and the theme/model-prefs/settings localStorage
 * keys) rolled into one importable/exportable JSON document.
 */

export const BACKUP_VERSION = 1

/** localStorage keys folded into the backup (theme, model prefs, app settings, hardware profile). */
const BACKUP_LOCAL_STORAGE_KEYS = [THEME_KEY, MODEL_PREFS_KEY, SETTINGS_KEY, HARDWARE_KEY]

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

const EFFORTS: Effort[] = ['fast', 'balanced', 'deep', 'ultrathink']

function isEffort(v: unknown): v is Effort {
  return typeof v === 'string' && (EFFORTS as string[]).includes(v)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/** Deep-validates every message: string id, role 'user'|'assistant', string content. */
function assertMessage(m: unknown): void {
  if (
    !isRecord(m) ||
    !isNonEmptyString(m.id) ||
    (m.role !== 'user' && m.role !== 'assistant') ||
    typeof m.content !== 'string'
  ) {
    throw new Error('Invalid backup file: malformed message entry')
  }
}

/** Deep-validates one conversation against the `Conversation` shape. */
function assertConversation(c: unknown): void {
  if (
    !isRecord(c) ||
    !isNonEmptyString(c.id) ||
    typeof c.title !== 'string' ||
    typeof c.model !== 'string' ||
    !isEffort(c.effort) ||
    !isFiniteNumber(c.temperature) ||
    !isFiniteNumber(c.createdAt) ||
    !isFiniteNumber(c.updatedAt) ||
    !Array.isArray(c.messages) ||
    (c.kbId !== undefined && typeof c.kbId !== 'string') ||
    (c.personaId !== undefined && typeof c.personaId !== 'string')
  ) {
    throw new Error('Invalid backup file: malformed conversation entry')
  }
  for (const m of c.messages) assertMessage(m)
}

/** Deep-validates one chunk against the `StoredChunk` shape. */
function assertChunk(c: unknown): void {
  if (
    !isRecord(c) ||
    !isNonEmptyString(c.id) ||
    typeof c.kbId !== 'string' ||
    typeof c.fileName !== 'string' ||
    typeof c.text !== 'string' ||
    !isFiniteNumber(c.index) ||
    !Array.isArray(c.vector) ||
    !c.vector.every(isFiniteNumber)
  ) {
    throw new Error('Invalid backup file: malformed chunk entry')
  }
}

/** Deep-validates one knowledge base against the `KnowledgeBase` shape. */
function assertKb(k: unknown): void {
  if (
    !isRecord(k) ||
    !isNonEmptyString(k.id) ||
    typeof k.name !== 'string' ||
    !isFiniteNumber(k.createdAt) ||
    !isFiniteNumber(k.fileCount) ||
    !isFiniteNumber(k.chunkCount) ||
    typeof k.embedModel !== 'string'
  ) {
    throw new Error('Invalid backup file: malformed kb entry')
  }
}

/** Deep-validates one persona against the `Persona` shape. */
function assertPersona(p: unknown): void {
  if (
    !isRecord(p) ||
    !isNonEmptyString(p.id) ||
    typeof p.name !== 'string' ||
    typeof p.icon !== 'string' ||
    typeof p.systemPrompt !== 'string' ||
    !isFiniteNumber(p.createdAt) ||
    (p.defaultModel !== undefined && typeof p.defaultModel !== 'string') ||
    (p.defaultEffort !== undefined && !isEffort(p.defaultEffort)) ||
    (p.defaultTemperature !== undefined && !isFiniteNumber(p.defaultTemperature))
  ) {
    throw new Error('Invalid backup file: malformed persona entry')
  }
}

/** Deep-validates one prompt against the `PromptItem` shape. */
function assertPrompt(p: unknown): void {
  if (
    !isRecord(p) ||
    !isNonEmptyString(p.id) ||
    typeof p.title !== 'string' ||
    typeof p.text !== 'string' ||
    !isFiniteNumber(p.createdAt)
  ) {
    throw new Error('Invalid backup file: malformed prompt entry')
  }
}

/** Deep-validates one stat against the `GenerationStat` shape. */
function assertStat(s: unknown): void {
  if (
    !isRecord(s) ||
    !isNonEmptyString(s.id) ||
    typeof s.conversationId !== 'string' ||
    typeof s.model !== 'string' ||
    !isFiniteNumber(s.startedAt) ||
    !isFiniteNumber(s.ttftMs) ||
    !isFiniteNumber(s.totalMs) ||
    !isFiniteNumber(s.promptTokens) ||
    !isFiniteNumber(s.completionTokens) ||
    !isFiniteNumber(s.tokensPerSec) ||
    !isFiniteNumber(s.loadMs)
  ) {
    throw new Error('Invalid backup file: malformed stat entry')
  }
}

/**
 * Validate an unknown value shape before touching any store. Throws on the
 * first structural or field-level violation — deep, not just an `id` check —
 * so hostile-but-structurally-valid JSON can't smuggle malformed records
 * into IndexedDB. Never partially applies: every record in every collection
 * is checked before `importAll` writes anything.
 */
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

  for (const c of data.conversations) assertConversation(c)
  for (const s of data.stats) assertStat(s)
  for (const k of data.kbs) assertKb(k)
  for (const c of data.chunks) assertChunk(c)
  for (const p of data.personas) assertPersona(p)
  for (const p of data.prompts) assertPrompt(p)
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
  dataWiped = true
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
