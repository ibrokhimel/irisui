import { describe, expect, it } from 'vitest'
import { resolve } from '../../../src/lib/providers/registry'

describe('resolve', () => {
  it('routes an Ollama ref to the Ollama adapter, keeping the colon-bearing id intact', () => {
    const { adapter, modelId } = resolve('ollama:qwen2.5:0.5b')
    expect(adapter.id).toBe('ollama')
    expect(modelId).toBe('qwen2.5:0.5b')
  })

  it('routes a cloud ref to its adapter', () => {
    expect(resolve('openai:gpt-4o-mini').adapter.id).toBe('openai')
    expect(resolve('anthropic:claude-haiku-4-5').adapter.id).toBe('anthropic')
  })

  it('routes a legacy unprefixed ref to Ollama', () => {
    const { adapter, modelId } = resolve('llama3.1:8b')
    expect(adapter.id).toBe('ollama')
    expect(modelId).toBe('llama3.1:8b')
  })
})
