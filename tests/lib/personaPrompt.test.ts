import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { resolveSystemPrompt } from '../../src/lib/personaPrompt'
import { createPersona, deletePersona } from '../../src/lib/studioStore'
import { openDB } from '../../src/lib/idbStore'
import { EFFORT_PROMPTS } from '../../src/constants'
import type { Conversation } from '../../src/lib/store'

const mkConv = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'c1',
  title: 'Chat',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  model: 'llama3.1:8b',
  effort: 'balanced',
  temperature: 0.7,
  messages: [],
  ...overrides,
})

describe('resolveSystemPrompt', () => {
  beforeEach(async () => {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('personas', 'readwrite')
      t.objectStore('personas').clear()
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  })

  it('uses the effort preset when the conversation has no persona', async () => {
    const prompt = await resolveSystemPrompt(mkConv({ effort: 'deep' }))
    expect(prompt).toBe(EFFORT_PROMPTS.deep)
  })

  it("uses the persona's system prompt when one is set, ignoring the effort preset", async () => {
    const persona = await createPersona({
      name: 'Coach',
      icon: '🧑‍🏫',
      systemPrompt: 'Be an encouraging coach.',
    })
    const prompt = await resolveSystemPrompt(mkConv({ personaId: persona.id, effort: 'fast' }))
    expect(prompt).toBe('Be an encouraging coach.')
  })

  it('falls back to the effort preset when the persona no longer exists', async () => {
    const persona = await createPersona({ name: 'Gone', icon: '👻', systemPrompt: 'Ghost.' })
    await deletePersona(persona.id)
    const prompt = await resolveSystemPrompt(mkConv({ personaId: persona.id, effort: 'ultrathink' }))
    expect(prompt).toBe(EFFORT_PROMPTS.ultrathink)
  })
})
