import type { Effort } from '../types'
import { PERSONAS, PROMPTS, openDB } from './idbStore'

/**
 * IndexedDB persistence for personas and the prompt library. Mirrors
 * kbStore.ts's transaction idiom (oncomplete/onerror/onabort); callers are
 * responsible for handling rejected promises.
 */

export interface Persona {
  id: string
  name: string
  /** Single emoji. */
  icon: string
  systemPrompt: string
  defaultModel?: string
  defaultEffort?: Effort
  defaultTemperature?: number
  createdAt: number
}

export interface PromptItem {
  id: string
  title: string
  text: string
  createdAt: number
}

/** Seeded into an empty prompt library so it's never blank on first visit. */
const STARTER_PROMPTS: { title: string; text: string }[] = [
  {
    title: 'Coding reviewer',
    text: 'Review the following code for bugs, readability, and best practices. Point out concrete issues and suggest specific fixes.',
  },
  {
    title: 'Summarizer',
    text: 'Summarize the following text in a few clear, concise bullet points. Keep the key facts, numbers, and names.',
  },
  {
    title: 'Study tutor',
    text: 'Explain the following topic as if teaching a curious beginner. Use a simple analogy, then ask me a short question to check my understanding.',
  },
  {
    title: 'Brainstormer',
    text: 'Brainstorm 10 varied, creative ideas for the following. Keep each idea to one line, then note your favorite and why.',
  },
]

let dbp: Promise<IDBDatabase> | null = null
const getDB = () => (dbp ??= openDB())

// ── personas ──────────────────────────────────────────────────────────
export async function listPersonas(): Promise<Persona[]> {
  const db = await getDB()
  const all = await new Promise<Persona[]>((resolve, reject) => {
    const req = db.transaction(PERSONAS, 'readonly').objectStore(PERSONAS).getAll()
    req.onsuccess = () => resolve(req.result as Persona[])
    req.onerror = () => reject(req.error)
  })
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getPersona(id: string): Promise<Persona | undefined> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(PERSONAS, 'readonly').objectStore(PERSONAS).get(id)
    req.onsuccess = () => resolve(req.result as Persona | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function createPersona(input: Omit<Persona, 'id' | 'createdAt'>): Promise<Persona> {
  const db = await getDB()
  const persona: Persona = { ...input, id: crypto.randomUUID(), createdAt: Date.now() }
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(PERSONAS, 'readwrite')
    t.objectStore(PERSONAS).put(persona)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
  return persona
}

export async function updatePersona(
  id: string,
  patch: Partial<Omit<Persona, 'id' | 'createdAt'>>,
): Promise<Persona> {
  const db = await getDB()
  const existing = await new Promise<Persona | undefined>((resolve, reject) => {
    const req = db.transaction(PERSONAS, 'readonly').objectStore(PERSONAS).get(id)
    req.onsuccess = () => resolve(req.result as Persona | undefined)
    req.onerror = () => reject(req.error)
  })
  if (!existing) throw new Error('Unknown persona')

  const updated: Persona = { ...existing, ...patch }
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(PERSONAS, 'readwrite')
    t.objectStore(PERSONAS).put(updated)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
  return updated
}

export async function deletePersona(id: string): Promise<void> {
  const db = await getDB()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(PERSONAS, 'readwrite')
    t.objectStore(PERSONAS).delete(id)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

// ── prompt library ───────────────────────────────────────────────────
export async function listPrompts(): Promise<PromptItem[]> {
  const db = await getDB()
  const all = await new Promise<PromptItem[]>((resolve, reject) => {
    const req = db.transaction(PROMPTS, 'readonly').objectStore(PROMPTS).getAll()
    req.onsuccess = () => resolve(req.result as PromptItem[])
    req.onerror = () => reject(req.error)
  })
  if (all.length > 0) return all.sort((a, b) => b.createdAt - a.createdAt)

  // Empty store: seed the starters so the library isn't blank, in declared order.
  const now = Date.now()
  const seeded = STARTER_PROMPTS.map((p, i) => ({
    id: crypto.randomUUID(),
    title: p.title,
    text: p.text,
    createdAt: now - i,
  }))
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(PROMPTS, 'readwrite')
    const store = t.objectStore(PROMPTS)
    for (const p of seeded) store.put(p)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
  return seeded
}

export async function createPrompt(title: string, text: string): Promise<PromptItem> {
  const db = await getDB()
  const prompt: PromptItem = { id: crypto.randomUUID(), title, text, createdAt: Date.now() }
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(PROMPTS, 'readwrite')
    t.objectStore(PROMPTS).put(prompt)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
  return prompt
}

export async function deletePrompt(id: string): Promise<void> {
  const db = await getDB()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(PROMPTS, 'readwrite')
    t.objectStore(PROMPTS).delete(id)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}
