import { describe, expect, it, vi } from 'vitest'
import { openaiAdapter } from '../../../src/lib/providers/openai.adapter'

function sse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch))
      c.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('openaiAdapter.streamChat', () => {
  it('forwards delta content and reads usage from the final chunk', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":9,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ])))

    const tokens: string[] = []
    const usage = await openaiAdapter.streamChat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    })

    expect(tokens.join('')).toBe('Hello')
    expect(usage.promptTokens).toBe(9)
    expect(usage.completionTokens).toBe(2)
    expect(usage.serverEvalNs).toBeUndefined() // OpenAI reports no server timing
  })

  it('requests usage in the stream, since cost depends on it', async () => {
    const fetchMock = vi.fn(async () => sse(['data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)
    await openaiAdapter.streamChat({
      model: 'gpt-4o-mini', messages: [], temperature: 0,
      signal: new AbortController().signal, onToken: () => {},
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
  })

  it('surfaces the provider error message rather than a generic failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 },
    )))
    await expect(openaiAdapter.streamChat({
      model: 'gpt-4o-mini', messages: [], temperature: 0,
      signal: new AbortController().signal, onToken: () => {},
    })).rejects.toThrow('Incorrect API key provided')
  })
})
