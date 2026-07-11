import type { ModelPricing } from './pricing'

/**
 * Cost of one generation in USD, or undefined when the model's price is unknown.
 *
 * undefined and 0 are different facts: 0 means "no tokens were billed", while
 * undefined means "we do not know what this costs". Callers must render the
 * latter as no cost at all — never as $0.00.
 */
export function computeCostUsd(
  usage: { promptTokens: number; completionTokens: number },
  pricing: ModelPricing | undefined,
): number | undefined {
  if (!pricing) return undefined
  return (
    (usage.promptTokens / 1_000_000) * pricing.inputPerMTok +
    (usage.completionTokens / 1_000_000) * pricing.outputPerMTok
  )
}
