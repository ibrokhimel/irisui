import { describe, expect, it } from 'vitest'
import { chunkText, cosineSim, topK, DEFAULT_EMBED_MODEL } from '../../src/lib/rag'

describe('DEFAULT_EMBED_MODEL', () => {
  it('is all-minilm', () => {
    expect(DEFAULT_EMBED_MODEL).toBe('all-minilm')
  })
})

describe('chunkText', () => {
  it('returns [] for empty or whitespace-only text', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n\n  \t ')).toEqual([])
  })

  it('returns [text] for a single short text', () => {
    expect(chunkText('hello world')).toEqual(['hello world'])
  })

  it('trims a short text but keeps it as one chunk', () => {
    expect(chunkText('  hello world  ')).toEqual(['hello world'])
  })

  it('respects custom size/overlap and never returns empty strings', () => {
    const text = 'x'.repeat(300)
    const chunks = chunkText(text, { size: 100, overlap: 20 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeGreaterThan(0)
  })

  it('hard-splits long text with no natural boundaries at size/overlap defaults', () => {
    // digit stream with no whitespace/punctuation -> forces hard cuts
    const text = Array.from({ length: 4000 }, (_, i) => String(i % 10)).join('')
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(1500)
    expect(chunks[1]).toHaveLength(1500)
    expect(chunks[2]).toHaveLength(1400)
    // overlap: last 200 chars of chunk0 === first 200 chars of chunk1
    expect(chunks[0].slice(1300, 1500)).toBe(chunks[1].slice(0, 200))
    expect(chunks[1].slice(1300, 1500)).toBe(chunks[2].slice(0, 200))
    // reassembled chunks cover the whole source
    expect(text.startsWith(chunks[0])).toBe(true)
    expect(text.endsWith(chunks[2])).toBe(true)
  })

  it('prefers breaking at a paragraph boundary over a hard cut', () => {
    const a = 'A'.repeat(1000)
    const b = 'B'.repeat(1000)
    const text = `${a}\n\n${b}`
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(2)
    // first chunk ends exactly at the paragraph boundary, not mid-window
    expect(chunks[0]).toBe(a)
    expect(chunks[1].endsWith(b)).toBe(true)
    expect(chunks[1].startsWith('A')).toBe(true)
  })

  it('prefers breaking at a sentence boundary when no paragraph break exists', () => {
    const sentence = 'Foo bar baz qux. '
    const text = sentence.repeat(100) // 1700 chars, no blank lines
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    // broke earlier than the hard 1500-char window
    expect(chunks[0].length).toBeLessThan(1500)
    // broke at a sentence end, not mid-word
    expect(/[.!?]$/.test(chunks[0])).toBe(true)
  })

  it('never returns empty strings even with irregular whitespace/paragraphs', () => {
    const text = 'para one'.repeat(50) + '\n\n\n\n' + 'para two'.repeat(50)
    const chunks = chunkText(text, { size: 200, overlap: 30 })
    for (const c of chunks) expect(c.trim().length).toBeGreaterThan(0)
  })
})

describe('cosineSim', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
  })

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('is -1 for opposite vectors', () => {
    expect(cosineSim([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1)
  })

  it('is 0 when either vector has zero norm', () => {
    expect(cosineSim([0, 0, 0], [1, 2, 3])).toBe(0)
    expect(cosineSim([1, 2, 3], [0, 0, 0])).toBe(0)
    expect(cosineSim([0, 0], [0, 0])).toBe(0)
  })
})

describe('topK', () => {
  const items = [
    { id: 'a', vector: [1, 0] },
    { id: 'b', vector: [0, 1] },
    { id: 'c', vector: [0.9, 0.1] },
  ]

  it('sorts results descending by score', () => {
    const result = topK([1, 0], items, 3)
    expect(result.map((r) => r.id)).toEqual(['a', 'c', 'b'])
    expect(result[0].score).toBeGreaterThan(result[1].score)
    expect(result[1].score).toBeGreaterThan(result[2].score)
  })

  it('limits results to k', () => {
    const result = topK([1, 0], items, 2)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('returns [] for k <= 0', () => {
    expect(topK([1, 0], items, 0)).toEqual([])
  })

  it('returns [] for an empty items list', () => {
    expect(topK([1, 0], [], 5)).toEqual([])
  })
})
