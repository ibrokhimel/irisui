import type { ModelDetails } from './ollama'
import { CTX_CRITICAL_PCT, CTX_WARN_PCT } from '../constants'

/**
 * The model's trained context length lives under `model_info`, behind an
 * architecture-prefixed key Ollama does not normalize (e.g. "llama.context_length",
 * "qwen2.context_length", "gemma3.context_length"). We search for the key shape
 * instead of hardcoding an architecture list that goes stale as new ones ship.
 */
export function parseContextLength(details: ModelDetails): number | undefined {
  const info = details.model_info
  if (info) {
    for (const [key, value] of Object.entries(info)) {
      if (key.endsWith('.context_length') && typeof value === 'number' && value > 0) {
        return value
      }
    }
  }

  // Fallback: a `num_ctx` PARAMETER line in the Modelfile text (`details.parameters`).
  // This is a configured override, not necessarily the model's trained maximum —
  // used only when model_info has nothing.
  const params = details.parameters
  if (typeof params === 'string') {
    const match = params.match(/^\s*num_ctx\s+(\d+)/m)
    if (match) {
      const n = Number(match[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }

  return undefined
}

export interface ContextUsage {
  used: number
  limit: number
  pct: number
  level: 'ok' | 'warn' | 'critical'
}

/**
 * `used` is always the MEASURED size of the last response (prompt + completion
 * tokens Ollama actually reported) — never an estimate of unsent text. See
 * ContextMeter's honesty rule.
 */
export function contextUsage(
  promptTokens: number,
  completionTokens: number,
  numCtx: number,
): ContextUsage {
  const used = Math.max(0, promptTokens) + Math.max(0, completionTokens)
  const limit = Math.max(0, numCtx)
  const pct = limit > 0 ? used / limit : 0
  const level: ContextUsage['level'] =
    pct >= CTX_CRITICAL_PCT ? 'critical' : pct >= CTX_WARN_PCT ? 'warn' : 'ok'
  return { used, limit, pct, level }
}

/** Compact magnitude formatting for the meter's badge: "812", "3.2k", "128k". */
export function formatTokens(n: number): string {
  const abs = Math.abs(n)
  if (abs < 1000) return String(Math.round(n))
  const thousands = n / 1000
  // One decimal below 10k keeps small counts (e.g. "3.2k") legible; whole
  // numbers above that avoid noisy false precision (e.g. "128k", not "128.0k").
  const decimals = Math.abs(thousands) < 10 ? 1 : 0
  return `${thousands.toFixed(decimals)}k`
}
