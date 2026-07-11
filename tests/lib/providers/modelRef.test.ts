import { describe, expect, it } from 'vitest'
import { formatModelRef, parseModelRef } from '../../../src/lib/providers/modelRef'

describe('parseModelRef', () => {
  it('splits on the first colon only, because Ollama names contain colons', () => {
    expect(parseModelRef('ollama:qwen2.5:0.5b')).toEqual({ providerId: 'ollama', id: 'qwen2.5:0.5b' })
  })

  it('parses a cloud ref', () => {
    expect(parseModelRef('openai:gpt-4o-mini')).toEqual({ providerId: 'openai', id: 'gpt-4o-mini' })
  })

  it('treats an unprefixed ref as Ollama, so legacy persisted values keep working', () => {
    expect(parseModelRef('qwen2.5:0.5b')).toEqual({ providerId: 'ollama', id: 'qwen2.5:0.5b' })
    expect(parseModelRef('llama3.1')).toEqual({ providerId: 'ollama', id: 'llama3.1' })
  })

  it('does not mistake a model name for a provider prefix', () => {
    // 'sera' is not a provider, so the whole string is an Ollama model id
    expect(parseModelRef('sera:latest')).toEqual({ providerId: 'ollama', id: 'sera:latest' })
  })

  it('returns an empty id for an empty ref', () => {
    expect(parseModelRef('')).toEqual({ providerId: 'ollama', id: '' })
  })
})

describe('formatModelRef', () => {
  it('round-trips', () => {
    const ref = formatModelRef('ollama', 'qwen2.5:0.5b')
    expect(ref).toBe('ollama:qwen2.5:0.5b')
    expect(parseModelRef(ref)).toEqual({ providerId: 'ollama', id: 'qwen2.5:0.5b' })
  })
})
