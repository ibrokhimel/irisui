import { describe, expect, it } from 'vitest'
import { contextUsage, formatTokens, parseContextLength } from '../../src/lib/context'
import type { ModelDetails } from '../../src/lib/ollama'

describe('parseContextLength', () => {
  it('reads llama.context_length from model_info', () => {
    const details: ModelDetails = {
      model_info: { 'llama.context_length': 8192, 'llama.embedding_length': 4096 },
    }
    expect(parseContextLength(details)).toBe(8192)
  })

  it('reads qwen2.context_length from model_info', () => {
    const details: ModelDetails = { model_info: { 'qwen2.context_length': 32768 } }
    expect(parseContextLength(details)).toBe(32768)
  })

  it('reads gemma3.context_length from model_info', () => {
    const details: ModelDetails = { model_info: { 'gemma3.context_length': 131072 } }
    expect(parseContextLength(details)).toBe(131072)
  })

  it('falls back to a num_ctx PARAMETER line when model_info has no context_length key', () => {
    const details: ModelDetails = { parameters: 'num_ctx    16384\nstop    "<|eot|>"' }
    expect(parseContextLength(details)).toBe(16384)
  })

  it('prefers model_info over the parameters fallback when both are present', () => {
    const details: ModelDetails = {
      model_info: { 'llama.context_length': 8192 },
      parameters: 'num_ctx    4096',
    }
    expect(parseContextLength(details)).toBe(8192)
  })

  it('returns undefined when genuinely unknown', () => {
    expect(parseContextLength({})).toBeUndefined()
    expect(parseContextLength({ model_info: { 'llama.embedding_length': 4096 } })).toBeUndefined()
    expect(parseContextLength({ parameters: 'stop  "<|eot|>"' })).toBeUndefined()
  })
})

describe('contextUsage', () => {
  it('computes used/limit/pct and stays "ok" below the warn threshold', () => {
    const u = contextUsage(1000, 500, 4096)
    expect(u.used).toBe(1500)
    expect(u.limit).toBe(4096)
    expect(u.pct).toBeCloseTo(1500 / 4096)
    expect(u.level).toBe('ok')
  })

  it('flags "warn" at/above CTX_WARN_PCT', () => {
    expect(contextUsage(3000, 100, 4096).level).toBe('warn') // ~75.7%
  })

  it('flags "critical" at/above CTX_CRITICAL_PCT', () => {
    expect(contextUsage(3700, 200, 4096).level).toBe('critical') // ~95.2%
  })

  it('guards divide-by-zero when numCtx is 0', () => {
    const u = contextUsage(100, 50, 0)
    expect(u.pct).toBe(0)
    expect(u.level).toBe('ok')
  })
})

describe('formatTokens', () => {
  it('renders small counts as plain integers', () => {
    expect(formatTokens(812)).toBe('812')
    expect(formatTokens(0)).toBe('0')
  })

  it('renders counts under 10k with one decimal', () => {
    expect(formatTokens(3200)).toBe('3.2k')
  })

  it('renders counts at/above 10k as whole numbers', () => {
    expect(formatTokens(128000)).toBe('128k')
    expect(formatTokens(131072)).toBe('131k')
  })
})
