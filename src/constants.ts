import type { Effort } from './types'

/**
 * Effort is implemented purely as a system-prompt preset. Ollama has no real
 * "reasoning effort" flag, so we steer the model with instructions instead.
 */
export const EFFORT_PROMPTS: Record<Effort, string> = {
  fast: 'Be concise. Prioritize speed.',
  balanced: 'Be helpful, clear, and accurate.',
  deep: 'Think carefully before answering. Consider edge cases and give a high-quality answer.',
  ultrathink:
    'Use maximum reasoning effort. Analyze the task carefully, verify assumptions, and provide the most complete polished final answer. Do not reveal hidden chain-of-thought; only provide the final answer.',
}

export const EFFORT_OPTIONS: { value: Effort; label: string; hint: string }[] = [
  { value: 'fast', label: 'Fast', hint: 'Concise, quick replies' },
  { value: 'balanced', label: 'Balanced', hint: 'Clear and accurate' },
  { value: 'deep', label: 'Deep', hint: 'Considers edge cases' },
  { value: 'ultrathink', label: 'UltraThink', hint: 'Maximum reasoning effort' },
]

export const EXAMPLE_PROMPTS = [
  'Explain this code',
  'Brainstorm app ideas',
  'Write a Python script',
  'Summarize text',
]

export const TEMP_MIN = 0
export const TEMP_MAX = 2
export const TEMP_STEP = 0.1
export const DEFAULT_TEMPERATURE = 0.7

/**
 * Ollama defaults `num_ctx` to 4096 no matter what the model was trained for,
 * so a 256k model silently runs at 4k unless we pass the option. Worse, once a
 * conversation outgrows the window llama.cpp *context-shifts*: it discards the
 * oldest half of the KV cache and keeps going, so the model quietly forgets the
 * start of the chat with nothing in the UI to say so. We size the window from
 * the model's real geometry instead, and hard-block sends that would overflow it.
 *
 * DEFAULT_NUM_CTX is only the fallback for when a model's geometry can't be
 * read — it matches Ollama's own default, so an unreadable model is never made
 * worse than the status quo by a guess.
 */
export const DEFAULT_NUM_CTX = 4096
export const NUM_CTX_FLOOR = 2048
export const NUM_CTX_LADDER = [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144]
export const NUM_CTX_MIN = 512

/**
 * Share of system RAM that auto-sizing may spend on weights + KV cache combined.
 * The rest is headroom for the OS, the browser, and whatever else is running.
 * Overcommitting here doesn't fail loudly — it just makes the whole machine
 * crawl as it swaps, which is worse than a smaller window.
 */
export const RAM_BUDGET_FRACTION = 0.6

/** Tokens held back from the window for the model's REPLY, so a prompt that
 *  only just fits doesn't leave the answer nowhere to land. */
export const CTX_RESERVE_TOKENS = 1024

/** Fractions of num_ctx at which the context meter changes color. */
export const CTX_WARN_PCT = 0.75
export const CTX_CRITICAL_PCT = 0.9
