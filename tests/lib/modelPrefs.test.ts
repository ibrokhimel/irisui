import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KEY, loadModelPrefs, saveModelPrefs } from '../../src/lib/modelPrefs'

/** vitest runs in the 'node' environment, which has no localStorage. */
function createLocalStorageMock(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
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

describe('loadModelPrefs', () => {
  it('qualifies legacy bare Ollama names, so existing users keep their default and favorites', () => {
    localStorage.setItem(KEY, JSON.stringify({ defaultModel: 'qwen2.5:0.5b', favorites: ['llama3.1:8b'] }))
    const prefs = loadModelPrefs()
    expect(prefs.defaultModel).toBe('ollama:qwen2.5:0.5b')
    expect(prefs.favorites).toEqual(['ollama:llama3.1:8b'])
  })

  it('leaves an already-qualified ref alone', () => {
    localStorage.setItem(KEY, JSON.stringify({ defaultModel: 'openai:gpt-4o-mini', favorites: [] }))
    expect(loadModelPrefs().defaultModel).toBe('openai:gpt-4o-mini')
  })

  it('round-trips through save', () => {
    saveModelPrefs({ defaultModel: 'anthropic:claude-haiku-4-5', favorites: ['ollama:m'] })
    expect(loadModelPrefs().defaultModel).toBe('anthropic:claude-haiku-4-5')
  })

  it('returns empty prefs when nothing is stored', () => {
    expect(loadModelPrefs()).toEqual({ defaultModel: '', favorites: [] })
  })
})
