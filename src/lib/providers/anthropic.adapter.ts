/**
 * Anthropic behind the common interface.
 *
 * Anthropic's stream is event-typed (message_start / content_block_delta /
 * message_delta), not the flat delta feed OpenAI sends — parsing it here is what
 * proves the ProviderAdapter interface is genuinely neutral rather than
 * OpenAI-shaped.
 *
 * Auth (the `x-api-key` header) is NEVER read in this file. The request goes
 * through providerFetch, and the stored key is injected by the transport layer —
 * Rust in the desktop shell, the Vite proxy in the browser — so the secret never
 * enters the webview. The non-secret `anthropic-version` header IS set here so
 * the request is correct in both environments.
 */
import { providerFetch } from '../http'
import { formatModelRef } from './modelRef'
import { lookupPricing } from './pricing'
import { readSseStream } from './sse'
import type { ChatUsage, ModelInfo, ProviderAdapter, StreamChatParams } from './types'

const ANTHROPIC_VERSION = '2023-06-01'

/** The API requires max_tokens. This is a ceiling, not a target. */
const MAX_TOKENS = 4096

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
  return `Anthropic responded with ${res.status}`
}

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  name: 'Anthropic',

  async listModels(signal) {
    const res = await providerFetch('anthropic', 'https://api.anthropic.com/v1/models', {
      headers: { 'anthropic-version': ANTHROPIC_VERSION },
      signal,
    })
    if (!res.ok) throw new Error(await readError(res))
    const data = (await res.json()) as { data?: { id?: unknown; display_name?: unknown }[] }
    return (data.data ?? [])
      .filter((m): m is { id: string; display_name?: string } => typeof m.id === 'string')
      .map<ModelInfo>((m) => ({
        ref: formatModelRef('anthropic', m.id),
        providerId: 'anthropic',
        id: m.id,
        label: typeof m.display_name === 'string' ? m.display_name : m.id,
        pricing: lookupPricing(formatModelRef('anthropic', m.id)),
      }))
  },

  async streamChat(p: StreamChatParams): Promise<ChatUsage> {
    const t0 = performance.now()
    let firstAt = 0
    let promptTokens = 0
    let completionTokens = 0

    // Anthropic takes the system prompt as a top-level field, not as a message
    // with role "system". Hoist it; send the rest through unchanged.
    const system = p.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    const messages = p.messages.filter((m) => m.role !== 'system')

    const res = await providerFetch('anthropic', 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: p.model,
        messages,
        ...(system ? { system } : {}),
        temperature: p.temperature,
        max_tokens: MAX_TOKENS,
        stream: true,
      }),
      signal: p.signal,
    })

    if (!res.ok) throw new Error(await readError(res))
    if (!res.body) throw new Error('Streaming is not supported in this environment')

    await readSseStream(res.body, (data) => {
      let ev: {
        type?: unknown
        delta?: { type?: unknown; text?: unknown }
        message?: { usage?: { input_tokens?: unknown } }
        usage?: { output_tokens?: unknown }
        error?: { message?: unknown }
      }
      try {
        ev = JSON.parse(data)
      } catch {
        return // a malformed frame must not kill the stream
      }

      // Anthropic reports mid-stream failures (overloaded_error, …) in-band on a
      // 200 that already passed the res.ok check above. Ignoring them the way we
      // ignore a ping would hand back a truncated answer as if it were complete —
      // billed, and with nothing to tell the user it was cut short.
      if (ev.type === 'error') {
        const message = ev.error?.message
        throw new Error(
          typeof message === 'string' && message ? message : 'The model stopped mid-response',
        )
      }

      // Anthropic's stream is event-typed rather than a flat delta feed; unknown
      // event types (ping, content_block_start, …) are simply not our business.
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        const text = ev.delta.text
        if (typeof text === 'string' && text) {
          if (!firstAt) firstAt = performance.now()
          p.onToken(text)
        }
      }
      if (ev.type === 'message_start' && typeof ev.message?.usage?.input_tokens === 'number') {
        promptTokens = ev.message.usage.input_tokens
      }
      if (ev.type === 'message_delta' && typeof ev.usage?.output_tokens === 'number') {
        completionTokens = ev.usage.output_tokens
      }
    })

    return {
      promptTokens,
      completionTokens,
      ttftMs: firstAt ? firstAt - t0 : 0,
      totalMs: performance.now() - t0,
    }
  },
}
