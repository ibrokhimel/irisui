import { describe, expect, it } from 'vitest'
import { allColumnsSettled, canRunArena, chatableModels, resizeSelection } from '../../src/lib/arena'
import type { OllamaModel } from '../../src/types'

const MODELS: OllamaModel[] = [
  { name: 'llama3.1:8b' },
  { name: 'qwen2.5:7b' },
  { name: 'nomic-embed-text' },
  { name: 'mistral' },
  { name: 'all-minilm' },
]

describe('chatableModels', () => {
  it('excludes likely-embedding models', () => {
    expect(chatableModels(MODELS).map((m) => m.name)).toEqual([
      'llama3.1:8b',
      'qwen2.5:7b',
      'mistral',
    ])
  })
})

describe('resizeSelection', () => {
  it('picks the first N distinct chatable models from an empty selection', () => {
    expect(resizeSelection([], 2, MODELS)).toEqual(['llama3.1:8b', 'qwen2.5:7b'])
    expect(resizeSelection([], 3, MODELS)).toEqual(['llama3.1:8b', 'qwen2.5:7b', 'mistral'])
  })

  it('pads with an empty slot once chatable models run out', () => {
    expect(resizeSelection([], 10, MODELS)).toEqual([
      'llama3.1:8b',
      'qwen2.5:7b',
      'mistral',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ])
  })

  it('yields only empty slots when nothing is chatable', () => {
    expect(resizeSelection([], 2, [{ name: 'nomic-embed-text' }])).toEqual(['', ''])
  })

  it('truncates when shrinking', () => {
    expect(resizeSelection(['llama3.1:8b', 'qwen2.5:7b', 'mistral'], 2, MODELS)).toEqual([
      'llama3.1:8b',
      'qwen2.5:7b',
    ])
  })

  it('fills new slots with a model not already selected', () => {
    expect(resizeSelection(['llama3.1:8b', 'qwen2.5:7b'], 3, MODELS)).toEqual([
      'llama3.1:8b',
      'qwen2.5:7b',
      'mistral',
    ])
  })

  it('falls back to an empty slot when no distinct chatable model remains', () => {
    expect(resizeSelection(['llama3.1:8b', 'qwen2.5:7b', 'mistral'], 3, [
      { name: 'llama3.1:8b' },
      { name: 'qwen2.5:7b' },
      { name: 'mistral' },
    ])).toEqual(['llama3.1:8b', 'qwen2.5:7b', 'mistral'])
  })
})

describe('allColumnsSettled', () => {
  it('is false while any column is idle or streaming', () => {
    expect(allColumnsSettled(['idle', 'idle'])).toBe(false)
    expect(allColumnsSettled(['done', 'streaming'])).toBe(false)
  })

  it('is true once every column has finished, errored, or stopped', () => {
    expect(allColumnsSettled(['done', 'error'])).toBe(true)
    expect(allColumnsSettled(['done', 'stopped', 'done'])).toBe(true)
  })

  it('is false for an empty column set', () => {
    expect(allColumnsSettled([])).toBe(false)
  })
})

describe('canRunArena', () => {
  it('requires a non-empty prompt and every slot filled', () => {
    expect(canRunArena('hello', ['a', 'b'], false)).toBe(true)
    expect(canRunArena('  ', ['a', 'b'], false)).toBe(false)
    expect(canRunArena('hello', ['a', ''], false)).toBe(false)
    expect(canRunArena('hello', ['a'], false)).toBe(false)
  })

  it('is false while already running', () => {
    expect(canRunArena('hello', ['a', 'b'], true)).toBe(false)
  })
})
