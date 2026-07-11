import { afterEach, describe, expect, it, vi } from 'vitest'
import { embedTexts } from '../../src/lib/ollama'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

afterEach(() => vi.unstubAllGlobals())

describe('embedTexts', () => {
  it('posts model + input and returns the embeddings array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await embedTexts('all-minilm', ['hello', 'world'])

    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/embed$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ model: 'all-minilm', input: ['hello', 'world'] })
  })

  it('returns [] for an empty texts array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ embeddings: [] })))
    expect(await embedTexts('all-minilm', [])).toEqual([])
  })

  it('throws readError message on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'model not found' }, 404)),
    )
    await expect(embedTexts('nope', ['hi'])).rejects.toThrow('model not found')
  })

  it('throws when the embeddings field is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))
    await expect(embedTexts('all-minilm', ['hi'])).rejects.toThrow(
      'Embedding failed: unexpected response',
    )
  })

  it('throws when embeddings.length does not match texts.length', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ embeddings: [[0.1]] })))
    await expect(embedTexts('all-minilm', ['a', 'b'])).rejects.toThrow(
      'Embedding failed: unexpected response',
    )
  })

  it('throws on a ragged embeddings array (inconsistent vector lengths)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ embeddings: [[0.1, 0.2], [0.3]] })),
    )
    await expect(embedTexts('all-minilm', ['a', 'b'])).rejects.toThrow(
      'Embedding failed: unexpected response',
    )
  })

  it('throws when an embedding contains non-numeric values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ embeddings: [[0.1, 'x']] })),
    )
    await expect(embedTexts('all-minilm', ['a'])).rejects.toThrow(
      'Embedding failed: unexpected response',
    )
  })

  it('throws when an embedding value is Infinity (e.g. 1e400 overflow after JSON.parse)', async () => {
    // JSON.stringify(Infinity) collapses to "null", so this constructs the
    // raw response body directly: 1e400 is valid JSON number syntax that
    // overflows to Infinity once parsed. `typeof Infinity === 'number'` is
    // true, so this only fails once the check uses Number.isFinite.
    const raw = '{"embeddings":[[1e400,0.2]]}'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(raw, { status: 200 })))
    await expect(embedTexts('all-minilm', ['a'])).rejects.toThrow(
      'Embedding failed: unexpected response',
    )
  })

  it('throws when an embedding value is NaN', async () => {
    // NaN has no JSON literal either; simulate a response whose .json()
    // resolves to a NaN-containing array (as a defensively-typed mock
    // would, e.g. a corrupt/synthetic Ollama payload) to cover the same
    // Number.isFinite branch from the other non-finite direction.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[NaN, 0.2]] }),
    }))
    await expect(embedTexts('all-minilm', ['a'])).rejects.toThrow(
      'Embedding failed: unexpected response',
    )
  })
})
