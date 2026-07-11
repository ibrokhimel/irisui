/**
 * Model prices, in USD per million tokens.
 *
 * These are a DATED SEED, not ground truth. Providers change prices, and a cost
 * readout that silently shows a stale number is worse than one that shows none —
 * the user trusts the figure. So: the table carries the date it was written, the
 * user can override any entry in Settings, and every cost in the UI is an
 * estimate (prefixed "≈"). A model absent from this table has no price, and no
 * cost is shown for it.
 *
 * Ollama models are local: they have no per-token price and are deliberately
 * absent.
 */
export interface ModelPricing {
  inputPerMTok: number
  outputPerMTok: number
}

/** The date the seed prices below were recorded. Shown to the user in Settings. */
export const PRICES_AS_OF = '2026-07-12'

/** Keyed by qualified model ref. Verify against the provider's own pricing page. */
export const SEED_PRICING: Record<string, ModelPricing> = {
  'openai:gpt-4o': { inputPerMTok: 2.5, outputPerMTok: 10 },
  'openai:gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  'anthropic:claude-sonnet-4-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'anthropic:claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
}

const KEY = 'irisui.pricing'

/** User corrections, merged over the seed table. */
export function loadPricing(): Record<string, ModelPricing> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...SEED_PRICING }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const overrides: Record<string, ModelPricing> = {}
    for (const [ref, v] of Object.entries(parsed)) {
      const p = v as Partial<ModelPricing> | null
      if (
        p && typeof p.inputPerMTok === 'number' && Number.isFinite(p.inputPerMTok) &&
        typeof p.outputPerMTok === 'number' && Number.isFinite(p.outputPerMTok)
      ) {
        overrides[ref] = { inputPerMTok: p.inputPerMTok, outputPerMTok: p.outputPerMTok }
      }
    }
    return { ...SEED_PRICING, ...overrides }
  } catch {
    return { ...SEED_PRICING }
  }
}

export function savePriceOverride(ref: string, pricing: ModelPricing): void {
  try {
    const raw = localStorage.getItem(KEY)
    let current: Record<string, ModelPricing> = {}
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          current = parsed as Record<string, ModelPricing>
        }
      } catch {
        // On parse failure or non-object value, fall back to empty object.
        // This allows the user's correction to persist even if the stored value is corrupt.
      }
    }
    current[ref] = pricing
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** undefined when the model has no known price (e.g. any local Ollama model). */
export function lookupPricing(ref: string): ModelPricing | undefined {
  return loadPricing()[ref]
}
