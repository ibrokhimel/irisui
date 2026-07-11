import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createPersona,
  createPrompt,
  deletePersona,
  deletePrompt,
  getPersona,
  listPersonas,
  listPrompts,
  updatePersona,
} from '../../src/lib/studioStore'
import { openDB } from '../../src/lib/idbStore'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const mkPersona = (name = 'Coach') => ({
  name,
  icon: '🧑‍🏫',
  systemPrompt: 'You are a helpful coach.',
})

describe('studioStore', () => {
  beforeEach(async () => {
    // fresh DB per test: clear both stores via a direct transaction
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(['personas', 'prompts'], 'readwrite')
      t.objectStore('personas').clear()
      t.objectStore('prompts').clear()
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  })

  describe('personas', () => {
    it('createPersona returns a fully-populated Persona', async () => {
      const p = await createPersona(mkPersona())
      expect(p.name).toBe('Coach')
      expect(p.icon).toBe('🧑‍🏫')
      expect(p.systemPrompt).toBe('You are a helpful coach.')
      expect(typeof p.id).toBe('string')
      expect(p.id.length).toBeGreaterThan(0)
      expect(typeof p.createdAt).toBe('number')
    })

    it('listPersonas returns personas newest first', async () => {
      const p1 = await createPersona(mkPersona('First'))
      await wait(5)
      const p2 = await createPersona(mkPersona('Second'))
      const all = await listPersonas()
      expect(all.map((p) => p.id)).toEqual([p2.id, p1.id])
    })

    it('getPersona returns the persona by id, or undefined if missing', async () => {
      const p = await createPersona(mkPersona())
      expect((await getPersona(p.id))?.name).toBe('Coach')
      expect(await getPersona('does-not-exist')).toBeUndefined()
    })

    it('updatePersona merges the patch, leaving untouched fields as-is', async () => {
      const p = await createPersona(mkPersona())
      const updated = await updatePersona(p.id, { name: 'Renamed', defaultEffort: 'deep' })
      expect(updated.name).toBe('Renamed')
      expect(updated.defaultEffort).toBe('deep')
      expect(updated.systemPrompt).toBe('You are a helpful coach.')
      expect((await getPersona(p.id))?.name).toBe('Renamed')
    })

    it('updatePersona rejects for an unknown id', async () => {
      await expect(updatePersona('does-not-exist', { name: 'x' })).rejects.toThrow(
        'Unknown persona',
      )
    })

    it('deletePersona removes the persona, leaving others untouched', async () => {
      const p1 = await createPersona(mkPersona('First'))
      const p2 = await createPersona(mkPersona('Second'))
      await deletePersona(p1.id)
      const remaining = await listPersonas()
      expect(remaining.map((p) => p.id)).toEqual([p2.id])
      expect(await getPersona(p1.id)).toBeUndefined()
    })
  })

  describe('prompt library', () => {
    it('listPrompts seeds 4 built-in starter prompts when the store is empty', async () => {
      const all = await listPrompts()
      expect(all).toHaveLength(4)
      expect(all.every((p) => p.title.length > 0 && p.text.length > 0)).toBe(true)
      expect(new Set(all.map((p) => p.id)).size).toBe(4)
    })

    it('does not reseed once a prompt already exists', async () => {
      await createPrompt('Custom', 'Do the thing.')
      const all = await listPrompts()
      expect(all).toHaveLength(1)
      expect(all[0].title).toBe('Custom')
    })

    it('createPrompt returns a fully-populated PromptItem', async () => {
      const p = await createPrompt('Title', 'Body text')
      expect(p.title).toBe('Title')
      expect(p.text).toBe('Body text')
      expect(typeof p.id).toBe('string')
      expect(typeof p.createdAt).toBe('number')
    })

    it('listPrompts returns prompts newest first', async () => {
      await createPrompt('First', 'a')
      await wait(5)
      await createPrompt('Second', 'b')
      const all = await listPrompts()
      expect(all.map((p) => p.title)).toEqual(['Second', 'First'])
    })

    it('deletePrompt removes the prompt, leaving others untouched', async () => {
      const seeded = await listPrompts()
      await deletePrompt(seeded[0].id)
      const remaining = await listPrompts()
      expect(remaining).toHaveLength(3)
      expect(remaining.some((p) => p.id === seeded[0].id)).toBe(false)
    })
  })
})
