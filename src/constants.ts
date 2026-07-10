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

/** A small, curated set of well-known models for one-click install. */
export const POPULAR_MODELS: { name: string; label: string; blurb: string; approxSize: string }[] = [
  { name: 'llama3.2:3b', label: 'Llama 3.2 3B', blurb: 'Small, fast, general-purpose (Meta).', approxSize: '~2 GB' },
  { name: 'llama3.1:8b', label: 'Llama 3.1 8B', blurb: 'Capable all-rounder, solid default.', approxSize: '~4.9 GB' },
  { name: 'qwen2.5:7b', label: 'Qwen 2.5 7B', blurb: 'Strong multilingual and coding model.', approxSize: '~4.7 GB' },
  { name: 'gemma3:4b', label: 'Gemma 3 4B', blurb: 'Efficient open model from Google.', approxSize: '~3.3 GB' },
  { name: 'phi4', label: 'Phi-4', blurb: 'Compact model tuned for reasoning.', approxSize: '~9 GB' },
  { name: 'mistral', label: 'Mistral 7B', blurb: 'Fast, well-rounded 7B model.', approxSize: '~4.1 GB' },
  { name: 'deepseek-r1:7b', label: 'DeepSeek-R1 7B', blurb: 'Reasoning-focused distilled model.', approxSize: '~4.7 GB' },
  { name: 'nomic-embed-text', label: 'Nomic Embed', blurb: 'Text-embedding model (not for chat).', approxSize: '~0.3 GB' },
]
