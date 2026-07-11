import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addChunks, createKb, deleteKb, getChunks, listKbs } from '../../src/lib/kbStore'
import type { StoredChunk } from '../../src/lib/kbStore'
import { openDB } from '../../src/lib/idbStore'

const mkChunk = (kbId: string, i: number, fileName = 'doc.txt'): StoredChunk => ({
  id: `${kbId}-${i}`,
  kbId,
  fileName,
  index: i,
  text: `chunk ${i}`,
  vector: [i, i + 1, i + 2],
})

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('kbStore', () => {
  beforeEach(async () => {
    // fresh DB per test: clear both stores via a direct transaction
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(['kbs', 'chunks'], 'readwrite')
      t.objectStore('kbs').clear()
      t.objectStore('chunks').clear()
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  })

  it('createKb returns a fully-populated KnowledgeBase with zeroed counts', async () => {
    const kb = await createKb('Docs', 'all-minilm')
    expect(kb.name).toBe('Docs')
    expect(kb.embedModel).toBe('all-minilm')
    expect(kb.fileCount).toBe(0)
    expect(kb.chunkCount).toBe(0)
    expect(typeof kb.id).toBe('string')
    expect(kb.id.length).toBeGreaterThan(0)
    expect(typeof kb.createdAt).toBe('number')
  })

  it('listKbs returns kbs newest first', async () => {
    const kb1 = await createKb('First', 'all-minilm')
    await wait(5)
    const kb2 = await createKb('Second', 'all-minilm')
    const all = await listKbs()
    expect(all.map((k) => k.id)).toEqual([kb2.id, kb1.id])
  })

  it('addChunks bulk-stores chunks and increments fileCount/chunkCount on the kb', async () => {
    const kb = await createKb('KB', 'all-minilm')
    await addChunks(kb.id, 'a.txt', [mkChunk(kb.id, 0), mkChunk(kb.id, 1)])
    await addChunks(kb.id, 'b.txt', [mkChunk(kb.id, 2)])

    const [updated] = await listKbs()
    expect(updated.fileCount).toBe(2)
    expect(updated.chunkCount).toBe(3)

    const chunks = await getChunks(kb.id)
    expect(chunks).toHaveLength(3)
    expect(chunks.map((c) => c.fileName).sort()).toEqual(['a.txt', 'a.txt', 'b.txt'])
    const withVector = chunks.find((c) => c.index === 0)
    expect(withVector?.vector).toEqual([0, 1, 2])
  })

  it('getChunks only returns chunks belonging to the given kbId', async () => {
    const kb1 = await createKb('KB1', 'all-minilm')
    const kb2 = await createKb('KB2', 'all-minilm')
    await addChunks(kb1.id, 'a.txt', [mkChunk(kb1.id, 0)])
    await addChunks(kb2.id, 'b.txt', [mkChunk(kb2.id, 0), mkChunk(kb2.id, 1)])

    expect(await getChunks(kb1.id)).toHaveLength(1)
    expect(await getChunks(kb2.id)).toHaveLength(2)
  })

  it('deleteKb removes the kb and all of its chunks, leaving other kbs untouched', async () => {
    const kb1 = await createKb('KB1', 'all-minilm')
    const kb2 = await createKb('KB2', 'all-minilm')
    await addChunks(kb1.id, 'a.txt', [mkChunk(kb1.id, 0), mkChunk(kb1.id, 1)])
    await addChunks(kb2.id, 'b.txt', [mkChunk(kb2.id, 0)])

    await deleteKb(kb1.id)

    const remaining = await listKbs()
    expect(remaining.map((k) => k.id)).toEqual([kb2.id])
    expect(await getChunks(kb1.id)).toEqual([])
    expect(await getChunks(kb2.id)).toHaveLength(1)
  })
})
