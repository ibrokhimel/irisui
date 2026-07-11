import { describe, expect, it } from 'vitest'
import { dismissMigrationNotice, shouldShowMigrationNotice } from '../../src/lib/firstRun'

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

describe('firstRun', () => {
  it('never shows the notice outside the desktop app', () => {
    const storage = createLocalStorageMock()
    expect(shouldShowMigrationNotice(false, storage)).toBe(false)
  })

  it('shows the notice on a fresh desktop install', () => {
    const storage = createLocalStorageMock()
    expect(shouldShowMigrationNotice(true, storage)).toBe(true)
  })

  it('stops showing the notice once it has been dismissed', () => {
    const storage = createLocalStorageMock()
    dismissMigrationNotice(storage)
    expect(shouldShowMigrationNotice(true, storage)).toBe(false)
  })
})
