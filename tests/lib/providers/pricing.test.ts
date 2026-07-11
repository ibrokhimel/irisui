import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEED_PRICING, loadPricing, savePriceOverride, lookupPricing, ModelPricing } from '../../../src/lib/providers/pricing'

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

describe('pricing', () => {
  it('loadPricing returns the seed table when nothing is stored', () => {
    expect(loadPricing()).toEqual(SEED_PRICING)
  })

  it('a stored override merges over the seed table', () => {
    const override: ModelPricing = { inputPerMTok: 5, outputPerMTok: 20 }
    localStorage.setItem('irisui.pricing', JSON.stringify({ 'openai:gpt-4o': override }))
    const loaded = loadPricing()
    expect(loaded['openai:gpt-4o']).toEqual(override)
  })

  it('an un-overridden seed entry survives the merge', () => {
    const override: ModelPricing = { inputPerMTok: 5, outputPerMTok: 20 }
    localStorage.setItem('irisui.pricing', JSON.stringify({ 'openai:gpt-4o': override }))
    const loaded = loadPricing()
    expect(loaded['openai:gpt-4o-mini']).toEqual(SEED_PRICING['openai:gpt-4o-mini'])
  })

  it('malformed JSON in storage falls back to the seed table', () => {
    localStorage.setItem('irisui.pricing', '{not json')
    expect(loadPricing()).toEqual(SEED_PRICING)
  })

  it('a non-object value in storage falls back to the seed table', () => {
    localStorage.setItem('irisui.pricing', JSON.stringify([1, 2, 3]))
    expect(loadPricing()).toEqual(SEED_PRICING)
  })

  it('skips entries with non-numeric inputPerMTok and keeps valid siblings', () => {
    localStorage.setItem(
      'irisui.pricing',
      JSON.stringify({
        'openai:gpt-4o': { inputPerMTok: 'not-a-number', outputPerMTok: 10 },
        'openai:gpt-4o-mini': { inputPerMTok: 0.2, outputPerMTok: 0.8 },
      }),
    )
    const loaded = loadPricing()
    expect(loaded['openai:gpt-4o']).toEqual(SEED_PRICING['openai:gpt-4o'])
    expect(loaded['openai:gpt-4o-mini']).toEqual({ inputPerMTok: 0.2, outputPerMTok: 0.8 })
  })

  it('skips entries with non-finite outputPerMTok and keeps valid siblings', () => {
    localStorage.setItem(
      'irisui.pricing',
      JSON.stringify({
        'openai:gpt-4o': { inputPerMTok: 2.5, outputPerMTok: Infinity },
        'openai:gpt-4o-mini': { inputPerMTok: 0.2, outputPerMTok: 0.8 },
      }),
    )
    const loaded = loadPricing()
    expect(loaded['openai:gpt-4o']).toEqual(SEED_PRICING['openai:gpt-4o'])
    expect(loaded['openai:gpt-4o-mini']).toEqual({ inputPerMTok: 0.2, outputPerMTok: 0.8 })
  })

  it('savePriceOverride round-trips: save a correction, then load returns it', () => {
    const newPrice: ModelPricing = { inputPerMTok: 5, outputPerMTok: 25 }
    savePriceOverride('openai:gpt-4o', newPrice)
    expect(loadPricing()['openai:gpt-4o']).toEqual(newPrice)
  })

  it('lookupPricing returns the price for a known model', () => {
    const newPrice: ModelPricing = { inputPerMTok: 5, outputPerMTok: 25 }
    savePriceOverride('openai:gpt-4o', newPrice)
    expect(lookupPricing('openai:gpt-4o')).toEqual(newPrice)
  })

  it('lookupPricing returns undefined for a model absent from the table', () => {
    expect(lookupPricing('ollama:whatever')).toBeUndefined()
  })

  // Regression test for Finding 1: corrupt value in storage must not prevent
  // savePriceOverride from persisting a new price.
  it('savePriceOverride persists even when a corrupt value already exists in storage', () => {
    // Simulate a corrupted stored value (truncated write, hand-edited, etc).
    localStorage.setItem('irisui.pricing', '{incomplete json')

    // savePriceOverride should fall back to {} and proceed with the write.
    const newPrice: ModelPricing = { inputPerMTok: 8, outputPerMTok: 32 }
    savePriceOverride('anthropic:claude-sonnet-4-5', newPrice)

    // Subsequent load should return the new price (merged with seed).
    const loaded = loadPricing()
    expect(loaded['anthropic:claude-sonnet-4-5']).toEqual(newPrice)

    // Other seed entries should also be intact.
    expect(loaded['openai:gpt-4o']).toEqual(SEED_PRICING['openai:gpt-4o'])
  })
})
