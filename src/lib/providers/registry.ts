import { anthropicAdapter } from './anthropic.adapter'
import { parseModelRef, type ProviderId } from './modelRef'
import { ollamaAdapter } from './ollama.adapter'
import { openaiAdapter } from './openai.adapter'
import type { ModelInfo, ProviderAdapter } from './types'

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  ollama: ollamaAdapter,
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
}

/** Route a qualified model ref to the adapter that serves it. */
export function resolve(ref: string): { adapter: ProviderAdapter; modelId: string } {
  const { providerId, id } = parseModelRef(ref)
  return { adapter: ADAPTERS[providerId], modelId: id }
}

/**
 * Models from every provider the user has configured. One provider being down
 * (Ollama not running, a rejected key) must not blank the whole picker, so each
 * provider's failure is contained to that provider.
 */
export async function listAllModels(configured: ProviderId[]): Promise<ModelInfo[]> {
  const results = await Promise.allSettled(configured.map((id) => ADAPTERS[id].listModels()))
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}
