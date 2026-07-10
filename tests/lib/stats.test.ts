import { describe, expect, it } from 'vitest'
import { computeStat, formatStatLine, summarizeByModel, toMessageStat } from '../../src/lib/stats'

const meta = {
  promptTokens: 20, completionTokens: 90,
  evalDurationNs: 3_000_000_000, totalDurationNs: 3_900_000_000, loadDurationNs: 500_000_000,
}

describe('computeStat', () => {
  it('derives tokens/sec from Ollama eval metadata', () => {
    const s = computeStat({ conversationId: 'c1', model: 'm', startedAt: 1000, ttftMs: 620, totalMs: 8200, meta })
    expect(s.tokensPerSec).toBeCloseTo(30) // 90 tokens / 3s
    expect(s.loadMs).toBe(500)
    expect(s.ttftMs).toBe(620)
    expect(s.id).toBeTruthy()
  })
  it('falls back to wall time when eval_duration is 0', () => {
    const s = computeStat({ conversationId: 'c1', model: 'm', startedAt: 1000, ttftMs: 100, totalMs: 3000, meta: { ...meta, evalDurationNs: 0 } })
    expect(s.tokensPerSec).toBeCloseTo(30) // 90 tokens / 3s wall
  })
})

describe('summarizeByModel', () => {
  it('averages per model and sorts by usage', () => {
    const mk = (model: string, tps: number, at: number) =>
      computeStat({ conversationId: 'c', model, startedAt: at, ttftMs: 100, totalMs: 1000, meta: { ...meta, completionTokens: tps * 3 } })
    const sums = summarizeByModel([mk('a', 10, 1), mk('a', 20, 2), mk('b', 40, 3)])
    expect(sums[0].model).toBe('a')
    expect(sums[0].count).toBe(2)
    expect(sums[0].avgTokensPerSec).toBeCloseTo(15)
    expect(sums[1].lastUsed).toBe(3)
  })
})

describe('formatStatLine', () => {
  it('renders the compact line', () => {
    const s = computeStat({ conversationId: 'c', model: 'sera:latest', startedAt: 1, ttftMs: 620, totalMs: 8200, meta: { ...meta, completionTokens: 67, evalDurationNs: 2_991_071_428 } })
    expect(formatStatLine(toMessageStat(s))).toBe('sera:latest · 22.4 tok/s · first token 620ms · total 8.2s')
  })
})
