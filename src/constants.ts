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
