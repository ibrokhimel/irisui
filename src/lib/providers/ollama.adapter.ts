import { fetchModels, streamChat as ollamaStreamChat } from '../ollama'
import { formatModelRef } from './modelRef'
import type { ChatUsage, ModelInfo, ProviderAdapter, StreamChatParams } from './types'

/**
 * Ollama behind the common interface. This is a thin wrapper: lib/ollama.ts keeps
 * owning the wire format, and the Models page keeps calling it directly for pull,
 * delete, show, and benchmark — concepts no cloud provider has.
 */
export const ollamaAdapter: ProviderAdapter = {
  id: 'ollama',
  name: 'Ollama',

  async listModels(signal) {
    const models = await fetchModels(signal)
    return models.map<ModelInfo>((m) => ({
      ref: formatModelRef('ollama', m.name),
      providerId: 'ollama',
      id: m.name,
      label: m.name,
      // Local models have no per-token price; leaving pricing undefined is what
      // makes the UI show no cost rather than "$0.00".
    }))
  },

  async streamChat(p: StreamChatParams): Promise<ChatUsage> {
    const t0 = performance.now()
    let firstAt = 0

    const numCtx = p.providerOptions?.num_ctx
    const meta = await ollamaStreamChat({
      model: p.model,
      messages: p.messages,
      temperature: p.temperature,
      numCtx: typeof numCtx === 'number' ? numCtx : undefined,
      signal: p.signal,
      onToken: (t) => {
        if (!firstAt) firstAt = performance.now()
        p.onToken(t)
      },
    })

    return {
      promptTokens: meta.promptTokens,
      completionTokens: meta.completionTokens,
      ttftMs: firstAt ? firstAt - t0 : 0,
      totalMs: performance.now() - t0,
      serverEvalNs: meta.evalDurationNs || undefined,
      loadDurationNs: meta.loadDurationNs || undefined,
    }
  },
}
