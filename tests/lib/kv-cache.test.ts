import { describe, expect, it } from 'vitest'
import { autoContextLength, kvBytesPerToken, parseKvGeometry } from '../../src/lib/kvCache'
import type { ModelDetails } from '../../src/lib/ollama'

/**
 * Geometry captured from real `/api/show` responses on a live Ollama, so these
 * assertions pin actual model shapes rather than invented ones.
 */
const QWEN35: ModelDetails = {
  model_info: {
    'qwen35.block_count': 32,
    'qwen35.attention.head_count': 16,
    'qwen35.attention.head_count_kv': 4,
    'qwen35.attention.key_length': 256,
    'qwen35.attention.value_length': 256,
    'qwen35.embedding_length': 4096,
    'qwen35.context_length': 262144,
  },
}

const QWEN2: ModelDetails = {
  model_info: {
    'qwen2.block_count': 24,
    'qwen2.attention.head_count': 14,
    'qwen2.attention.head_count_kv': 2,
    'qwen2.embedding_length': 896,
    'qwen2.context_length': 32768,
  },
}

const BERT: ModelDetails = {
  model_info: {
    'bert.block_count': 6,
    'bert.attention.head_count': 12,
    'bert.embedding_length': 384,
    'bert.context_length': 512,
  },
}

describe('parseKvGeometry', () => {
  it('reads explicit key/value dims (qwen35)', () => {
    expect(parseKvGeometry(QWEN35)).toEqual({
      blockCount: 32,
      kvHeads: 4,
      keyLength: 256,
      valueLength: 256,
    })
  })

  it('derives head_dim from embedding_length / head_count when dims are absent (qwen2)', () => {
    expect(parseKvGeometry(QWEN2)).toEqual({
      blockCount: 24,
      kvHeads: 2,
      keyLength: 64, // 896 / 14
      valueLength: 64,
    })
  })

  it('falls back to head_count when the model has no grouped-query KV heads (bert)', () => {
    expect(parseKvGeometry(BERT)).toEqual({
      blockCount: 6,
      kvHeads: 12,
      keyLength: 32, // 384 / 12
      valueLength: 32,
    })
  })

  it('returns undefined rather than guessing when model_info is missing or unusable', () => {
    expect(parseKvGeometry({})).toBeUndefined()
    expect(parseKvGeometry({ model_info: {} })).toBeUndefined()
    expect(parseKvGeometry({ model_info: { 'x.block_count': 32 } })).toBeUndefined()
    // Non-numeric / non-positive values must not slip through into NaN math.
    expect(
      parseKvGeometry({
        model_info: { 'x.block_count': 'lots', 'x.attention.head_count': 16 },
      }),
    ).toBeUndefined()
    expect(
      parseKvGeometry({
        model_info: { 'x.block_count': 32, 'x.attention.head_count': 0 },
      }),
    ).toBeUndefined()
  })
})

describe('kvBytesPerToken', () => {
  // The number that makes this whole feature necessary: 128 KB per token means
  // qwen3.5-9b's advertised 262144 context would need ~32 GB of KV cache alone.
  it('computes 128 KB/token for qwen35', () => {
    expect(kvBytesPerToken(parseKvGeometry(QWEN35)!)).toBe(131072)
  })

  it('computes 12 KB/token for qwen2.5:0.5b', () => {
    expect(kvBytesPerToken(parseKvGeometry(QWEN2)!)).toBe(12288)
  })

  it('halves for an 8-bit cache', () => {
    expect(kvBytesPerToken(parseKvGeometry(QWEN35)!, 1)).toBe(65536)
  })
})

describe('autoContextLength', () => {
  const sera = { trainedMax: 262144, bytesPerToken: 131072, modelBytes: 8.28e9 }

  it('does NOT hand a 9B model its full 256k context on 32 GB of RAM', () => {
    const { numCtx, reason } = autoContextLength({ ...sera, ramGb: 32 })
    // Budget: 32 GB * 0.6 - 8.28 GB = ~11 GB; / 128 KB/token = ~87k -> 65536 rung.
    expect(reason).toBe('ram-limited')
    expect(numCtx).toBe(65536)
    expect(numCtx).toBeLessThan(262144)
  })

  it('gives a small model its full trained max when RAM is plentiful', () => {
    const { numCtx, reason } = autoContextLength({
      trainedMax: 32768,
      bytesPerToken: 12288,
      modelBytes: 0.4e9,
      ramGb: 32,
    })
    expect(reason).toBe('model-max')
    expect(numCtx).toBe(32768)
  })

  it('drops to the floor when the weights alone eat the budget', () => {
    const { numCtx, reason } = autoContextLength({ ...sera, ramGb: 8 })
    // 8 GB * 0.6 = 4.8 GB < 8.28 GB of weights — nothing left for a KV cache.
    expect(reason).toBe('floor')
    expect(numCtx).toBe(2048)
  })

  it('never exceeds the trained max, even at the floor', () => {
    // all-minilm tops out at 512, which is below the 2048 floor and every ladder rung.
    const { numCtx } = autoContextLength({
      trainedMax: 512,
      bytesPerToken: 1e9, // absurd cost, forces the floor branch
      modelBytes: 0.05e9,
      ramGb: 32,
    })
    expect(numCtx).toBe(512)
  })

  it('falls back to Ollama’s own default when the geometry is unreadable', () => {
    expect(autoContextLength({ trainedMax: 262144, modelBytes: 1e9, ramGb: 32 })).toEqual({
      numCtx: 4096,
      reason: 'unknown',
    })
    expect(autoContextLength({ bytesPerToken: 131072, modelBytes: 1e9, ramGb: 32 })).toEqual({
      numCtx: 4096,
      reason: 'unknown',
    })
    expect(autoContextLength({ ...sera, ramGb: 0 })).toEqual({ numCtx: 4096, reason: 'unknown' })
  })

  it('scales with the RAM budget', () => {
    const small = autoContextLength({ ...sera, ramGb: 16 }).numCtx
    const large = autoContextLength({ ...sera, ramGb: 64 }).numCtx
    expect(small).toBeLessThan(large)
  })
})
