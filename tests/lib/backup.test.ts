import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BACKUP_VERSION, deleteAllData, exportAll, importAll, isDataWiped, validateBackup } from '../../src/lib/backup'
import type { BackupFile } from '../../src/lib/backup'
import { getStore } from '../../src/lib/store'
import type { Conversation } from '../../src/lib/store'
import { createKb, addChunks, listKbs, getChunks } from '../../src/lib/kbStore'
import { addStat, listStats } from '../../src/lib/statsStore'
import { computeStat } from '../../src/lib/stats'
import { createPersona, createPrompt, listPersonas, listPrompts, deletePrompt } from '../../src/lib/studioStore'
import { openDB, STORE_NAMES } from '../../src/lib/idbStore'

/** Minimal in-memory Storage mock — vitest runs in the 'node' environment, which has no localStorage. */
function createLocalStorageMock(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

const conv = (id: string, title = 'Chat'): Conversation => ({
  id,
  title,
  createdAt: 1,
  updatedAt: 1,
  model: 'llama3.1:8b',
  effort: 'balanced',
  temperature: 0.7,
  messages: [{ id: `${id}-m1`, role: 'user', content: 'hi' }],
})

const emptyBackup = (): BackupFile => ({
  version: BACKUP_VERSION,
  exportedAt: Date.now(),
  conversations: [],
  stats: [],
  kbs: [],
  chunks: [],
  personas: [],
  prompts: [],
  localStorage: {},
})

beforeEach(async () => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_NAMES, 'readwrite')
    for (const name of STORE_NAMES) t.objectStore(name).clear()
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('exportAll', () => {
  it('bundles conversations, stats, kbs+chunks, personas, prompts, and localStorage', async () => {
    await getStore().put(conv('c1'))
    localStorage.setItem('irisui.theme', JSON.stringify({ preset: 'dark', accent: '#fff' }))
    localStorage.setItem('irisui.models', JSON.stringify({ defaultModel: 'm', favorites: [] }))
    localStorage.setItem('irisui.settings', JSON.stringify({ ollamaUrl: '', defaultEffort: 'fast', defaultTemperature: 1 }))
    localStorage.setItem('some-other-app.key', 'should not leak in')

    const kb = await createKb('Docs', 'all-minilm')
    await addChunks(kb.id, 'a.txt', [{ id: 'ch1', kbId: kb.id, fileName: 'a.txt', index: 0, text: 't', vector: [1, 2] }])

    const meta = { promptTokens: 1, completionTokens: 5, evalDurationNs: 1e9, totalDurationNs: 1e9, loadDurationNs: 0 }
    await addStat(computeStat({ conversationId: 'c1', model: 'm', startedAt: 1, ttftMs: 10, totalMs: 100, meta }))

    await createPersona({ name: 'Coach', icon: '🧑‍🏫', systemPrompt: 'help' })
    for (const p of await listPrompts()) await deletePrompt(p.id) // clear seeded starters for a clean count
    await createPrompt('Title', 'Body')

    const backup = await exportAll()

    expect(backup.version).toBe(BACKUP_VERSION)
    expect(backup.conversations).toHaveLength(1)
    expect(backup.conversations[0].id).toBe('c1')
    expect(backup.conversations[0].messages).toHaveLength(1)
    expect(backup.kbs).toHaveLength(1)
    expect(backup.chunks).toHaveLength(1)
    expect(backup.stats).toHaveLength(1)
    expect(backup.personas).toHaveLength(1)
    expect(backup.prompts).toHaveLength(1)
    expect(backup.localStorage['irisui.theme']).toContain('dark')
    expect(backup.localStorage['irisui.models']).toContain('defaultModel')
    expect(backup.localStorage['irisui.settings']).toContain('fast')
    expect(backup.localStorage['some-other-app.key']).toBeUndefined()
  })
})

describe('validateBackup', () => {
  it.each([
    ['null', null],
    ['a string', 'oops'],
    ['a number', 42],
    ['an array', [1, 2, 3]],
    ['missing version', { ...emptyBackup(), version: undefined }],
    ['conversations not an array', { ...emptyBackup(), conversations: {} }],
    ['stats not an array', { ...emptyBackup(), stats: 'nope' }],
    ['localStorage not an object', { ...emptyBackup(), localStorage: [] }],
    ['a malformed conversation (no id)', { ...emptyBackup(), conversations: [{ messages: [] }] }],
    ['a malformed conversation (messages not an array)', { ...emptyBackup(), conversations: [{ id: 'x', messages: 'nope' }] }],
    ['a malformed kb entry (no id)', { ...emptyBackup(), kbs: [{ name: 'x' }] }],
    ['a non-string localStorage value', { ...emptyBackup(), localStorage: { 'irisui.theme': 123 } }],
    ['a conversation with a null message', { ...emptyBackup(), conversations: [{ ...conv('c1'), messages: [null] }] }],
    ['a conversation with an invalid effort', { ...emptyBackup(), conversations: [{ ...conv('c1'), effort: 'nope' }] }],
    ['a conversation with a non-finite temperature', { ...emptyBackup(), conversations: [{ ...conv('c1'), temperature: NaN }] }],
    [
      'a message with an invalid role',
      { ...emptyBackup(), conversations: [{ ...conv('c1'), messages: [{ id: 'm1', role: 'system', content: 'x' }] }] },
    ],
    [
      'a chunk with a non-array vector',
      { ...emptyBackup(), chunks: [{ id: 'ch1', kbId: 'kb1', fileName: 'a.txt', index: 0, text: 't', vector: 'nope' }] },
    ],
    [
      'a chunk with a non-numeric vector entry',
      { ...emptyBackup(), chunks: [{ id: 'ch1', kbId: 'kb1', fileName: 'a.txt', index: 0, text: 't', vector: [1, 'x'] }] },
    ],
    ['a persona missing systemPrompt', { ...emptyBackup(), personas: [{ id: 'p1', name: 'X', icon: '🤖', createdAt: 1 }] }],
    [
      'a persona with an invalid defaultEffort',
      { ...emptyBackup(), personas: [{ id: 'p1', name: 'X', icon: '🤖', systemPrompt: 's', createdAt: 1, defaultEffort: 'nope' }] },
    ],
    ['a prompt missing text', { ...emptyBackup(), prompts: [{ id: 'pr1', title: 'X', createdAt: 1 }] }],
    [
      'a stat with a non-finite field',
      {
        ...emptyBackup(),
        stats: [{ id: 's1', conversationId: 'c1', model: 'm', startedAt: 1, ttftMs: 1, totalMs: 1, promptTokens: 1, completionTokens: 1, tokensPerSec: 1, loadMs: NaN }],
      },
    ],
  ])('rejects %s', (_label, garbage) => {
    expect(() => validateBackup(garbage)).toThrow(/invalid backup file/i)
  })

  it('accepts a well-formed empty backup', () => {
    expect(validateBackup(emptyBackup())).toEqual(emptyBackup())
  })

  it('accepts a well-formed backup with populated collections', () => {
    const backup: BackupFile = {
      ...emptyBackup(),
      conversations: [conv('c1')],
      stats: [{ id: 's1', conversationId: 'c1', model: 'm', startedAt: 1, ttftMs: 1, totalMs: 1, promptTokens: 1, completionTokens: 1, tokensPerSec: 1, loadMs: 1 }],
    }
    expect(validateBackup(backup).conversations).toHaveLength(1)
  })
})

describe('importAll', () => {
  it('rejects garbage input and writes nothing', async () => {
    await expect(importAll('not a backup')).rejects.toThrow(/invalid backup file/i)
    expect(await getStore().listMeta()).toEqual([])
  })

  it('merge-by-id upserts conversations, stats, kbs, chunks, personas, and prompts', async () => {
    await getStore().put(conv('existing', 'Keep me'))

    const backup: BackupFile = {
      ...emptyBackup(),
      conversations: [conv('existing', 'Overwritten'), conv('new-one', 'Fresh')],
      kbs: [{ id: 'kb1', name: 'Imported KB', createdAt: 1, fileCount: 1, chunkCount: 1, embedModel: 'all-minilm' }],
      chunks: [{ id: 'ch1', kbId: 'kb1', fileName: 'a.txt', index: 0, text: 't', vector: [1] }],
      personas: [{ id: 'p1', name: 'Imported', icon: '🤖', systemPrompt: 'x', createdAt: 1 }],
      prompts: [{ id: 'pr1', title: 'Imported prompt', text: 'x', createdAt: 1 }],
      stats: [{ id: 'st1', conversationId: 'existing', model: 'm', startedAt: 1, ttftMs: 1, totalMs: 1, promptTokens: 1, completionTokens: 1, tokensPerSec: 1, loadMs: 1 }],
    }

    await importAll(backup)

    const metas = await getStore().listMeta()
    expect(metas.map((m) => m.id).sort()).toEqual(['existing', 'new-one'])
    expect(metas.find((m) => m.id === 'existing')?.title).toBe('Overwritten')

    expect((await listKbs()).map((k) => k.id)).toEqual(['kb1'])
    expect((await getChunks('kb1')).map((c) => c.id)).toEqual(['ch1'])
    expect((await listPersonas()).map((p) => p.id)).toEqual(['p1'])
    expect((await listPrompts()).map((p) => p.id)).toContain('pr1')
    expect((await listStats()).map((s) => s.id)).toEqual(['st1'])
  })

  it('restores the backed-up localStorage keys', async () => {
    const backup: BackupFile = {
      ...emptyBackup(),
      localStorage: { 'irisui.theme': '{"preset":"wine","accent":"#abc"}' },
    }
    await importAll(backup)
    expect(localStorage.getItem('irisui.theme')).toBe('{"preset":"wine","accent":"#abc"}')
  })
})

describe('deleteAllData', () => {
  it('clears every IndexedDB store and every irisui.* localStorage key, leaving other keys alone', async () => {
    await getStore().put(conv('c1'))
    await createKb('Docs', 'all-minilm')
    localStorage.setItem('irisui.theme', 'x')
    localStorage.setItem('irisui.settings', 'y')
    localStorage.setItem('unrelated.key', 'keep-me')

    expect(isDataWiped()).toBe(false)
    await deleteAllData()

    expect(await getStore().listMeta()).toEqual([])
    expect(await listKbs()).toEqual([])
    expect(localStorage.getItem('irisui.theme')).toBeNull()
    expect(localStorage.getItem('irisui.settings')).toBeNull()
    expect(localStorage.getItem('unrelated.key')).toBe('keep-me')

    // Belt-and-braces resurrection guard: `dataWiped` flips permanently so an
    // in-flight persist()/addStat() racing the reload can't re-write data.
    expect(isDataWiped()).toBe(true)
  })
})
