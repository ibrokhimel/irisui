import { describe, expect, it } from 'vitest'
import { buildContextMessage, isModelInstalled, snippet, toSources } from '../../src/lib/ragContext'

const SNIPPET_LIMIT = 240

describe('buildContextMessage', () => {
  it('prefixes the citation instructions and numbers excerpts from 1', () => {
    const msg = buildContextMessage([
      { fileName: 'a.txt', text: 'alpha' },
      { fileName: 'b.md', text: 'beta' },
    ])
    expect(msg).toBe(
      'Use the following source excerpts to answer. Cite sources inline as [1], [2] matching the excerpt numbers. If the excerpts are irrelevant, say so and answer from general knowledge.\n\n[1] (a.txt) alpha\n[2] (b.md) beta',
    )
  })

  it('keeps full excerpt text (no truncation) in the context body', () => {
    const long = 'x'.repeat(2000)
    const msg = buildContextMessage([{ fileName: 'big.txt', text: long }])
    expect(msg.includes(long)).toBe(true)
  })

  it('formats a single excerpt without a trailing separator', () => {
    const msg = buildContextMessage([{ fileName: 'only.txt', text: 'solo' }])
    expect(msg.endsWith('\n\n[1] (only.txt) solo')).toBe(true)
  })
})

describe('snippet', () => {
  it('collapses runs of whitespace/newlines to single spaces', () => {
    expect(snippet('foo\n\n  bar\tbaz')).toBe('foo bar baz')
  })

  it('truncates with an ellipsis past the max length', () => {
    const s = snippet('a'.repeat(300))
    expect(s.length).toBeLessThanOrEqual(SNIPPET_LIMIT + 1)
    expect(s.endsWith('…')).toBe(true)
  })

  it('leaves short text unchanged', () => {
    expect(snippet('hello world')).toBe('hello world')
  })
})

describe('toSources', () => {
  it('numbers from 1, carries fileName, and snippets the text', () => {
    const sources = toSources([
      { fileName: 'a.txt', text: '  first   chunk  ' },
      { fileName: 'b.txt', text: 'second' },
    ])
    expect(sources).toEqual([
      { n: 1, fileName: 'a.txt', snippet: 'first chunk' },
      { n: 2, fileName: 'b.txt', snippet: 'second' },
    ])
  })
})

describe('isModelInstalled', () => {
  it('matches an exact name', () => {
    expect(isModelInstalled(['all-minilm', 'llama3'], 'all-minilm')).toBe(true)
  })

  it('tolerates the implicit :latest tag in both directions', () => {
    expect(isModelInstalled(['all-minilm:latest'], 'all-minilm')).toBe(true)
    expect(isModelInstalled(['all-minilm'], 'all-minilm:latest')).toBe(true)
  })

  it('matches a tagged variant of the same model', () => {
    expect(isModelInstalled(['all-minilm:33m'], 'all-minilm')).toBe(true)
  })

  it('is false when absent or given empty inputs', () => {
    expect(isModelInstalled(['llama3'], 'all-minilm')).toBe(false)
    expect(isModelInstalled([], 'all-minilm')).toBe(false)
    expect(isModelInstalled(['all-minilm'], '')).toBe(false)
  })
})
