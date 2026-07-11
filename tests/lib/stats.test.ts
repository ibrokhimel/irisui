import { describe, expect, it } from 'vitest'
import { computeStat, formatStatLine, summarizeByModel, toMessageStat } from '../../src/lib/stats'

const usage = {
  promptTokens: 20, completionTokens: 90,
  ttftMs: 620, totalMs: 8200,
  serverEvalNs: 3_000_000_000, loadDurationNs: 500_000_000,
}

describe('computeStat', () => {
  it('derives tokens/sec from Ollama server timing when present', () => {
    const s = computeStat({ conversationId: 'c1', model: 'ollama:m', startedAt: 1000, usage })
    expect(s.tokensPerSec).toBeCloseTo(30) // 90 tokens / 3s
    expect(s.loadMs).toBe(500)
    expect(s.ttftMs).toBe(620)
    expect(s.providerId).toBe('ollama')
  })

  it('falls back to wall time for a cloud provider, which reports no server timing', () => {
    const cloud = { promptTokens: 20, completionTokens: 90, ttftMs: 100, totalMs: 3000 }
    const s = computeStat({ conversationId: 'c1', model: 'openai:gpt-4o-mini', startedAt: 1000, usage: cloud })
    expect(s.tokensPerSec).toBeCloseTo(30) // 90 tokens / 3s wall
    expect(s.providerId).toBe('openai')
  })

  it('records cost when the model is priced', () => {
    const cloud = { promptTokens: 1_000_000, completionTokens: 1_000_000, ttftMs: 100, totalMs: 3000 }
    const s = computeStat({
      conversationId: 'c1', model: 'openai:gpt-4o-mini', startedAt: 1000, usage: cloud,
      pricing: { inputPerMTok: 2, outputPerMTok: 10 },
    })
    expect(s.costUsd).toBeCloseTo(12)
  })

  it('leaves cost undefined for an unpriced (local) model', () => {
    const s = computeStat({ conversationId: 'c1', model: 'ollama:m', startedAt: 1000, usage })
    expect(s.costUsd).toBeUndefined()
  })
})

describe('summarizeByModel', () => {
  it('averages per model and sorts by usage', () => {
    const mk = (model: string, tps: number, at: number) =>
      computeStat({ conversationId: 'c', model, startedAt: at, usage: { ...usage, ttftMs: 100, totalMs: 1000, completionTokens: tps * 3 } })
    const sums = summarizeByModel([mk('a', 10, 1), mk('a', 20, 2), mk('b', 40, 3)])
    expect(sums[0].model).toBe('a')
    expect(sums[0].count).toBe(2)
    expect(sums[0].avgTokensPerSec).toBeCloseTo(15)
    expect(sums[1].lastUsed).toBe(3)
  })

  it('sums and averages prompt/completion tokens per model', () => {
    const mk = (model: string, completionTokens: number) =>
      computeStat({ conversationId: 'c', model, startedAt: 1, usage: { ...usage, ttftMs: 100, totalMs: 1000, promptTokens: 20, completionTokens } })
    const sums = summarizeByModel([mk('a', 10), mk('a', 30)])
    expect(sums[0].totalPromptTokens).toBe(40)
    expect(sums[0].totalCompletionTokens).toBe(40)
    expect(sums[0].avgPromptTokens).toBeCloseTo(20)
  })
})

describe('formatStatLine', () => {
  it('renders the compact line', () => {
    const s = computeStat({
      conversationId: 'c', model: 'sera:latest', startedAt: 1,
      usage: { ...usage, ttftMs: 620, totalMs: 8200, completionTokens: 67, serverEvalNs: 2_991_071_428 },
    })
    expect(formatStatLine(toMessageStat(s))).toBe('sera:latest · 22.4 tok/s · first token 620ms · total 8.2s · ↑20 in · ↓67 out')
  })

  it('omits the in/out segment when promptTokens is absent (pre-upgrade persisted messages)', () => {
    const stat = { model: 'm', tokensPerSec: 10, ttftMs: 100, totalMs: 1000, completionTokens: 50 }
    expect(formatStatLine(stat)).toBe('m · 10.0 tok/s · first token 100ms · total 1.0s')
  })

  it('shows cost as an estimate, never as a bare figure', () => {
    const stat = {
      model: 'openai:gpt-4o-mini', tokensPerSec: 10, ttftMs: 100, totalMs: 1000,
      completionTokens: 50, promptTokens: 20, providerId: 'openai' as const, costUsd: 0.0042,
    }
    expect(formatStatLine(stat)).toContain('≈ $0.0042')
    expect(formatStatLine(stat)).toContain('gpt-4o-mini')   // bare id, not the qualified ref
  })

  it('shows no cost segment at all when cost is unknown', () => {
    const stat = { model: 'ollama:m', tokensPerSec: 10, ttftMs: 100, totalMs: 1000, completionTokens: 50 }
    expect(formatStatLine(stat)).not.toContain('$')
  })
})
