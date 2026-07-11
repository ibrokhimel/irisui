import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, KEY, loadAppSettings, saveAppSettings } from '../../src/lib/appSettings'

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

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})
afterEach(() => vi.unstubAllGlobals())

describe('appSettings', () => {
  it('loadAppSettings returns defaults when nothing is stored', () => {
    expect(loadAppSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('saveAppSettings persists and loadAppSettings reads it back', () => {
    saveAppSettings({ ollamaUrl: 'http://10.0.0.5:11434', defaultEffort: 'deep', defaultTemperature: 1.1 })
    expect(loadAppSettings()).toEqual({
      ollamaUrl: 'http://10.0.0.5:11434',
      defaultEffort: 'deep',
      defaultTemperature: 1.1,
    })
  })

  it('trims whitespace around a custom ollamaUrl', () => {
    saveAppSettings({ ...DEFAULT_SETTINGS, ollamaUrl: '  http://localhost:9999  ' })
    expect(loadAppSettings().ollamaUrl).toBe('http://localhost:9999')
  })

  it('clamps defaultTemperature above the max down to TEMP_MAX', () => {
    saveAppSettings({ ...DEFAULT_SETTINGS, defaultTemperature: 99 })
    expect(loadAppSettings().defaultTemperature).toBe(2)
  })

  it('clamps defaultTemperature below the min up to TEMP_MIN', () => {
    saveAppSettings({ ...DEFAULT_SETTINGS, defaultTemperature: -5 })
    expect(loadAppSettings().defaultTemperature).toBe(0)
  })

  it('falls back to the default temperature for a non-finite value', () => {
    saveAppSettings({ ...DEFAULT_SETTINGS, defaultTemperature: NaN })
    expect(loadAppSettings().defaultTemperature).toBe(DEFAULT_SETTINGS.defaultTemperature)
  })

  it('falls back to the default effort for a value outside the whitelist', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ollamaUrl: '', defaultEffort: 'turbo-nuke', defaultTemperature: 0.5 }),
    )
    expect(loadAppSettings().defaultEffort).toBe(DEFAULT_SETTINGS.defaultEffort)
  })

  it('ignores unknown/garbage fields and falls back to defaults for missing ones', () => {
    localStorage.setItem(KEY, JSON.stringify({ foo: 'bar' }))
    expect(loadAppSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadAppSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults when the stored value is a JSON array (not an object)', () => {
    localStorage.setItem(KEY, JSON.stringify([1, 2, 3]))
    expect(loadAppSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('accepts every whitelisted effort value', () => {
    for (const effort of ['fast', 'balanced', 'deep', 'ultrathink'] as const) {
      saveAppSettings({ ...DEFAULT_SETTINGS, defaultEffort: effort })
      expect(loadAppSettings().defaultEffort).toBe(effort)
    }
  })
})
