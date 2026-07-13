import { providerFetch } from '../http'
import { formatModelRef } from './modelRef'
import { lookupPricing } from './pricing'
import { readSseStream } from './sse'
import type { ChatUsage, ModelInfo, ProviderAdapter, StreamChatParams } from './types'

/**
 * Requests reach OpenAI through providerFetch, which injects the API key in the
 * transport layer — Rust in the desktop app, the Vite proxy in the browser. No
 * key is present in this file, or anywhere else in the browser bundle.
 */

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text()
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown } }
      if (typeof parsed.error?.message === 'string') return parsed.error.message
    } catch {
      if (text) return text.slice(0, 200)
    }
  } catch {
    /* ignore body read failures */
  }
  return `OpenAI responded with ${res.status}`
}

export const openaiAdapter: ProviderAdapter = {
  id: 'openai',
  name: 'OpenAI',

  async listModels(signal) {
    const res = await providerFetch('openai', 'https://api.openai.com/v1/models', { signal })
    if (!res.ok) throw new Error(await readError(res))
    const data = (await res.json()) as { data?: { id?: unknown }[] }
    return (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string')
      // Chat models only: the models endpoint also lists embeddings, TTS, and more.
      .filter((id) => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3'))
      .sort()
      .map<ModelInfo>((id) => ({
        ref: formatModelRef('openai', id),
        providerId: 'openai',
        id,
        label: id,
        pricing: lookupPricing(formatModelRef('openai', id)),
      }))
  },

  async streamChat(p: StreamChatParams): Promise<ChatUsage> {
    const t0 = performance.now()
    let firstAt = 0
    let promptTokens = 0
    let completionTokens = 0

    const res = await providerFetch('openai', 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: p.model,
        messages: p.messages,
        temperature: p.temperature,
        stream: true,
        // Without this the final chunk carries no usage, and we could not cost
        // the call from real numbers — only by guessing. We do not guess.
        stream_options: { include_usage: true },
      }),
      signal: p.signal,
    })

    if (!res.ok) throw new Error(await readError(res))
    if (!res.body) throw new Error('Streaming is not supported in this environment')

    await readSseStream(res.body, (data) => {
      let obj: {
        choices?: { delta?: { content?: unknown } }[]
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
        error?: { message?: unknown }
      }
      try {
        obj = JSON.parse(data)
      } catch {
        return // a malformed frame must not kill the stream
      }

      // An error can arrive in-band on a stream that already returned 200, so
      // res.ok above does not catch it. Falling through would present a truncated
      // answer as a complete one.
      if (obj.error) {
        const message = obj.error.message
        throw new Error(
          typeof message === 'string' && message ? message : 'The model stopped mid-response',
        )
      }

      const delta = obj.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) {
        if (!firstAt) firstAt = performance.now()
        p.onToken(delta)
      }
      if (typeof obj.usage?.prompt_tokens === 'number') promptTokens = obj.usage.prompt_tokens
      if (typeof obj.usage?.completion_tokens === 'number') completionTokens = obj.usage.completion_tokens
    })

    return {
      promptTokens,
      completionTokens,
      ttftMs: firstAt ? firstAt - t0 : 0,
      totalMs: performance.now() - t0,
      // No serverEvalNs / loadDurationNs: OpenAI reports no server-side timing,
      // so computeStat falls back to wall-clock tokens/sec.
    }
  },
}
