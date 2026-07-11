import { describe, expect, it } from 'vitest'
import { computeCostUsd } from '../../../src/lib/providers/cost'

const pricing = { inputPerMTok: 2, outputPerMTok: 10 }

describe('computeCostUsd', () => {
  it('charges input and output at their separate rates', () => {
    // 1M input @ $2 + 1M output @ $10 = $12
    expect(computeCostUsd({ promptTokens: 1_000_000, completionTokens: 1_000_000 }, pricing)).toBeCloseTo(12)
  })

  it('scales to realistic token counts', () => {
    // 2000 in @ $2/M = $0.004 ; 500 out @ $10/M = $0.005 ; total $0.009
    expect(computeCostUsd({ promptTokens: 2000, completionTokens: 500 }, pricing)).toBeCloseTo(0.009)
  })

  it('returns undefined — NOT 0 — when pricing is unknown', () => {
    // A local Ollama model has no price. Rendering "$0.00" would be a lie:
    // it asserts the call was free-of-charge rather than not-priced.
    expect(computeCostUsd({ promptTokens: 2000, completionTokens: 500 }, undefined)).toBeUndefined()
  })

  it('returns 0 only when there genuinely were no tokens', () => {
    expect(computeCostUsd({ promptTokens: 0, completionTokens: 0 }, pricing)).toBe(0)
  })
})
