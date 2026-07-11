import type { ProviderId } from './modelRef'
import type { ModelPricing } from './pricing'

/**
 * What a provider reports about one generation, plus client-measured timing.
 *
 * Only Ollama returns server-side eval/load durations; cloud providers report
 * token usage and nothing else. Those fields are therefore optional, and the
 * tokens/sec math falls back to wall-clock time when they are absent.
 */
export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  ttftMs: number            // measured by the adapter, every provider
  totalMs: number           // measured by the adapter, every provider
  serverEvalNs?: number     // Ollama's eval_duration
  loadDurationNs?: number   // Ollama's load_duration
}

export interface ModelInfo {
  ref: string               // qualified: 'openai:gpt-4o-mini'
  providerId: ProviderId
  id: string                // provider-native: 'gpt-4o-mini'
  label: string
  contextLength?: number    // absent when unknown
  pricing?: ModelPricing    // absent when unknown
}

export interface StreamChatParams {
  model: string             // provider-native id, NOT a qualified ref
  messages: { role: string; content: string }[]
  temperature: number
  signal: AbortSignal
  onToken: (delta: string) => void
  /** Provider-specific knobs (e.g. Ollama's num_ctx). Ignored by providers that
   *  do not understand them, so one provider's options never leak into another. */
  providerOptions?: Record<string, unknown>
}

export interface ProviderAdapter {
  id: ProviderId
  name: string
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  streamChat(p: StreamChatParams): Promise<ChatUsage>
  embed?(model: string, texts: string[]): Promise<number[][]>
}
