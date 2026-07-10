import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamChat } from '../../src/lib/ollama'

function ndjsonResponse(lines: object[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(new TextEncoder().encode(JSON.stringify(l) + '\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

afterEach(() => vi.unstubAllGlobals())

describe('streamChat', () => {
  it('forwards tokens and returns the done-chunk metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([
      { message: { content: 'Hel' } },
      { message: { content: 'lo' } },
      { done: true, prompt_eval_count: 12, eval_count: 90, eval_duration: 3_000_000_000, total_duration: 3_900_000_000, load_duration: 500_000_000 },
    ])))
    const tokens: string[] = []
    const result = await streamChat({
      model: 'm', messages: [], temperature: 0.7,
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    })
    expect(tokens.join('')).toBe('Hello')
    expect(result.completionTokens).toBe(90)
    expect(result.promptTokens).toBe(12)
    expect(result.evalDurationNs).toBe(3_000_000_000)
    expect(result.totalDurationNs).toBe(3_900_000_000)
    expect(result.loadDurationNs).toBe(500_000_000)
  })

  it('returns zeros when the stream ends without a done chunk', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([{ message: { content: 'x' } }])))
    const result = await streamChat({
      model: 'm', messages: [], temperature: 0.7,
      signal: new AbortController().signal, onToken: () => {},
    })
    expect(result.completionTokens).toBe(0)
  })
})
