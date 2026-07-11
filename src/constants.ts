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
 * Ollama truncates every prompt to `num_ctx` and defaults to 4096 no matter
 * what the model was trained for — so a 128k model silently runs at 4k unless
 * we pass the option. DEFAULT_NUM_CTX matches Ollama's own default, which
 * keeps behavior identical for anyone who never touches the setting.
 *
 * Raising it costs VRAM (the KV cache grows with the window), so the UI offers
 * discrete steps clamped to the model's trained maximum rather than a free slider.
 */
export const DEFAULT_NUM_CTX = 4096
export const NUM_CTX_OPTIONS = [2048, 4096, 8192, 16384, 32768, 65536, 131072]
export const NUM_CTX_MIN = 512

/** Fractions of num_ctx at which the context meter changes color. */
export const CTX_WARN_PCT = 0.75
export const CTX_CRITICAL_PCT = 0.9
