import type { GenerationStat } from './stats'
import { STATS, openDB } from './idbStore'
import { isDataWiped } from './backup'

let dbp: Promise<IDBDatabase> | null = null
const getDB = () => (dbp ??= openDB())

export async function addStat(stat: GenerationStat): Promise<void> {
  if (isDataWiped()) return
  try {
    const db = await getDB()
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STATS, 'readwrite')
      t.objectStore(STATS).put(stat)
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error)
    })
  } catch {
    /* stats are best-effort — never surface storage errors */
  }
}

export async function listStats(limit?: number): Promise<GenerationStat[]> {
  const db = await getDB()
  const all = await new Promise<GenerationStat[]>((resolve, reject) => {
    const req = db.transaction(STATS, 'readonly').objectStore(STATS).getAll()
    req.onsuccess = () => resolve(req.result as GenerationStat[])
    req.onerror = () => reject(req.error)
  })
  const sorted = all.sort((a, b) => b.startedAt - a.startedAt)
  return limit !== undefined ? sorted.slice(0, limit) : sorted
}

export async function clearStats(): Promise<void> {
  try {
    const db = await getDB()
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STATS, 'readwrite')
      t.objectStore(STATS).clear()
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error)
    })
  } catch {
    /* stats are best-effort — never surface storage errors */
  }
}
