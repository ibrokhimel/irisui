import { describe, expect, it, vi } from 'vitest'
import { ollamaAdapter } from '../../../src/lib/providers/ollama.adapter'

/** Build a Response whose body streams the given chunks. */
function ndjsonResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(l))
      c.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('ollamaAdapter.streamChat', () => {
  it('forwards content deltas and reports usage from the done chunk', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjsonResponse([
      '{"message":{"content":"Hel"}}\n',
      '{"message":{"content":"lo"}}\n',
      '{"done":true,"prompt_eval_count":11,"eval_count":2,"eval_duration":1000000000,"load_duration":500000000}\n',
    ])))

    const tokens: string[] = []
    const usage = await ollamaAdapter.streamChat({
      model: 'qwen2.5:0.5b',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    })

    expect(tokens.join('')).toBe('Hello')
    expect(usage.promptTokens).toBe(11)
    expect(usage.completionTokens).toBe(2)
    expect(usage.serverEvalNs).toBe(1_000_000_000)
    expect(usage.loadDurationNs).toBe(500_000_000)
    expect(usage.totalMs).toBeGreaterThanOrEqual(0)
  })

  it('survives a malformed line without dropping the stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjsonResponse([
      '{"message":{"content":"a"}}\n',
      'not json at all\n',
      '{"message":{"content":"b"}}\n',
      '{"done":true,"eval_count":2,"prompt_eval_count":1}\n',
    ])))

    const tokens: string[] = []
    await ollamaAdapter.streamChat({
      model: 'm', messages: [], temperature: 0, signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    })
    expect(tokens.join('')).toBe('ab')
  })

  it('passes num_ctx through providerOptions', async () => {
    const fetchMock = vi.fn(async () => ndjsonResponse(['{"done":true,"eval_count":0,"prompt_eval_count":0}\n']))
    vi.stubGlobal('fetch', fetchMock)

    await ollamaAdapter.streamChat({
      model: 'm', messages: [], temperature: 0.5, signal: new AbortController().signal,
      onToken: () => {}, providerOptions: { num_ctx: 8192 },
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.options).toEqual({ temperature: 0.5, num_ctx: 8192 })
  })
})
