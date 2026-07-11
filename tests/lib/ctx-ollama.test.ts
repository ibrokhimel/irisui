import { afterEach, describe, expect, it, vi } from 'vitest'
import { getModelContextLength, streamChat } from '../../src/lib/ollama'

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

describe('streamChat num_ctx', () => {
  it('omits num_ctx from options when not provided (unchanged behavior)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse([{ done: true }]))
    vi.stubGlobal('fetch', fetchMock)
    await streamChat({
      model: 'm', messages: [], temperature: 0.7,
      signal: new AbortController().signal, onToken: () => {},
    })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.options).toEqual({ temperature: 0.7 })
  })

  it('sends num_ctx in options when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse([{ done: true }]))
    vi.stubGlobal('fetch', fetchMock)
    await streamChat({
      model: 'm', messages: [], temperature: 0.7, numCtx: 32768,
      signal: new AbortController().signal, onToken: () => {},
    })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.options).toEqual({ temperature: 0.7, num_ctx: 32768 })
  })
})

describe('getModelContextLength', () => {
  it('memoizes per model name — only one /api/show round-trip for repeat calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ model_info: { 'llama.context_length': 8192 } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const unique = `cache-test-model-${Math.random()}`
    expect(await getModelContextLength(unique)).toBe(8192)
    expect(await getModelContextLength(unique)).toBe(8192)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resolves to undefined (without throwing) when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const unique = `cache-test-fail-${Math.random()}`
    await expect(getModelContextLength(unique)).resolves.toBeUndefined()
  })
})
