import type { ModelDetails } from './ollama'
import {
  DEFAULT_NUM_CTX,
  NUM_CTX_FLOOR,
  NUM_CTX_LADDER,
  RAM_BUDGET_FRACTION,
} from '../constants'

/**
 * Sizing the context window from the model's real KV-cache geometry.
 *
 * A model's advertised context length is NOT what it can afford to run at. The
 * KV cache grows linearly with the window, and its per-token cost varies by
 * orders of magnitude between models: qwen2.5:0.5b needs ~12 KB/token, while
 * qwen3.5-9b needs ~128 KB/token. So the same 262144-token "max" costs 3 GB on
 * one model and 32 GB on another — the latter being more memory than most
 * machines have. Taking the advertised max at face value is how you hang a
 * laptop.
 */

export interface KvGeometry {
  blockCount: number
  kvHeads: number
  keyLength: number
  valueLength: number
}

/** model_info values are `unknown` — only accept a usable positive number. */
function positiveNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
}

/**
 * model_info keys are architecture-prefixed and Ollama does not normalize them
 * ("qwen2.block_count", "qwen35.block_count", "llama.block_count", ...), so we
 * match on the key SUFFIX rather than hardcoding an architecture list that goes
 * stale with every new model family.
 */
function findBySuffix(info: Record<string, unknown>, suffix: string): number | undefined {
  for (const [key, value] of Object.entries(info)) {
    if (key.endsWith(suffix)) {
      const n = positiveNumber(value)
      if (n !== undefined) return n
    }
  }
  return undefined
}

/**
 * Returns undefined rather than guessing when the geometry is unreadable — a
 * wrong number here silently mis-sizes every request, which is worse than
 * falling back to Ollama's own default.
 */
export function parseKvGeometry(details: ModelDetails): KvGeometry | undefined {
  const info = details.model_info
  if (!info) return undefined

  const blockCount = findBySuffix(info, '.block_count')
  const headCount = findBySuffix(info, '.attention.head_count')
  if (blockCount === undefined || headCount === undefined) return undefined

  // Grouped-query attention models publish head_count_kv; multi-head models
  // omit it entirely, where every query head has its own KV head.
  const kvHeads = findBySuffix(info, '.attention.head_count_kv') ?? headCount

  // Newer architectures state key/value dims explicitly (they aren't always
  // embedding_length / head_count — qwen35 uses 256 where that ratio gives 256
  // only by coincidence). Older ones don't, so derive it.
  const embeddingLength = findBySuffix(info, '.embedding_length')
  const derivedHeadDim =
    embeddingLength !== undefined ? Math.floor(embeddingLength / headCount) : undefined

  const keyLength = findBySuffix(info, '.attention.key_length') ?? derivedHeadDim
  if (keyLength === undefined || keyLength <= 0) return undefined
  const valueLength = findBySuffix(info, '.attention.value_length') ?? keyLength

  return { blockCount, kvHeads, keyLength, valueLength }
}

/**
 * Bytes of KV cache per token of context. Both a K and a V vector are cached
 * for every layer and every KV head.
 *
 * Assumes an f16 cache (2 bytes/element), which is Ollama's default. A user who
 * sets OLLAMA_KV_CACHE_TYPE=q8_0 halves the true cost, so we'd under-size — the
 * safe direction, and the manual override exists for it.
 */
export function kvBytesPerToken(geo: KvGeometry, bytesPerElement = 2): number {
  return geo.blockCount * geo.kvHeads * (geo.keyLength + geo.valueLength) * bytesPerElement
}

export type AutoReason = 'model-max' | 'ram-limited' | 'floor' | 'unknown' | 'manual'

export interface AutoContext {
  numCtx: number
  reason: AutoReason
}

/** Largest rung that does not exceed `n`. Stepping down to a rung (rather than
 *  using the raw number) keeps the reported window a round, recognizable size. */
function floorToLadder(n: number): number {
  let best = NUM_CTX_FLOOR
  for (const rung of NUM_CTX_LADDER) {
    if (rung <= n) best = rung
  }
  return best
}

/**
 * Pick the largest context window this model can afford on this machine.
 *
 * Weights and KV cache compete for the same memory, so the model's own size is
 * subtracted from the budget first. What's left is divided by the per-token
 * cost — that, capped by what the model was actually trained for, is the answer.
 */
export function autoContextLength(input: {
  trainedMax?: number
  bytesPerToken?: number
  modelBytes: number
  ramGb: number
  fraction?: number
}): AutoContext {
  const { trainedMax, bytesPerToken, modelBytes, ramGb, fraction = RAM_BUDGET_FRACTION } = input

  // Never invent a window from incomplete data: fall back to Ollama's own
  // default so an unreadable model is no worse off than before.
  if (!trainedMax || !bytesPerToken || !Number.isFinite(ramGb) || ramGb <= 0) {
    return { numCtx: DEFAULT_NUM_CTX, reason: 'unknown' }
  }

  // Every branch below is capped by trainedMax: the floor and the ladder rungs
  // both start at 2048, which would otherwise hand a larger window than it
  // supports to a small-context model (all-minilm tops out at 512).
  const budgetBytes = ramGb * 1e9 * fraction - modelBytes
  const affordable = budgetBytes > 0 ? Math.floor(budgetBytes / bytesPerToken) : 0

  if (affordable < NUM_CTX_FLOOR) {
    return { numCtx: Math.min(trainedMax, NUM_CTX_FLOOR), reason: 'floor' }
  }

  // RAM only binds when it lands us below what the model was trained for. When
  // it doesn't, use the trained max verbatim rather than a ladder rung — not
  // every model's max is a round power of two, and rounding it down would throw
  // away context the machine can genuinely afford.
  if (affordable >= trainedMax) return { numCtx: trainedMax, reason: 'model-max' }

  return { numCtx: Math.min(trainedMax, floorToLadder(affordable)), reason: 'ram-limited' }
}
