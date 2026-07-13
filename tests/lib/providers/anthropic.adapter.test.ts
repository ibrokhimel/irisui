import { describe, expect, it, vi } from 'vitest'
import { anthropicAdapter } from '../../../src/lib/providers/anthropic.adapter'

function sse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch))
      c.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('anthropicAdapter.streamChat', () => {
  it('accumulates text_delta events and reads usage from message_start/message_delta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      'data: {"type":"message_start","message":{"usage":{"input_tokens":14}}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
      'data: {"type":"message_delta","usage":{"output_tokens":2}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ])))

    const tokens: string[] = []
    const usage = await anthropicAdapter.streamChat({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    })

    expect(tokens.join('')).toBe('Hello')
    expect(usage.promptTokens).toBe(14)
    expect(usage.completionTokens).toBe(2)
  })

  it('hoists a system message into the top-level system field, as the API requires', async () => {
    const fetchMock = vi.fn(async () => sse(['data: {"type":"message_stop"}\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await anthropicAdapter.streamChat({
      model: 'claude-haiku-4-5',
      messages: [
        { role: 'system', content: 'You are terse.' },
        { role: 'user', content: 'hi' },
      ],
      temperature: 0.5,
      signal: new AbortController().signal,
      onToken: () => {},
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.system).toBe('You are terse.')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.max_tokens).toBeGreaterThan(0) // required by the API
  })

  it('ignores an unknown event type rather than failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      'data: {"type":"ping"}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ])))
    const tokens: string[] = []
    await anthropicAdapter.streamChat({
      model: 'm', messages: [], temperature: 0,
      signal: new AbortController().signal, onToken: (t) => tokens.push(t),
    })
    expect(tokens.join('')).toBe('x')
  })

  // Anthropic reports overload mid-stream, in-band, on a 200 that already passed
  // the res.ok check. Resolving here would bill the user for a truncated answer
  // and present it as complete.
  it('rejects on an in-band error event, even after streaming partial text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n',
      'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
    ])))

    await expect(anthropicAdapter.streamChat({
      model: 'm', messages: [], temperature: 0,
      signal: new AbortController().signal, onToken: () => {},
    })).rejects.toThrow('Overloaded')
  })

  it('rejects with a fallback message when the error frame carries none', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      'data: {"type":"error","error":{"type":"api_error"}}\n\n',
    ])))

    await expect(anthropicAdapter.streamChat({
      model: 'm', messages: [], temperature: 0,
      signal: new AbortController().signal, onToken: () => {},
    })).rejects.toThrow(/stopped mid-response/)
  })
})
