import { describe, expect, it } from 'vitest'
import { ASR_MODELS, findAsrModel } from '../../src/lib/asrModels'
import { DEFAULT_ASR_MODEL } from '../../src/lib/appSettings'

describe('findAsrModel', () => {
  it('finds a model by id', () => {
    expect(findAsrModel('onnx-community/whisper-tiny.en')?.id).toBe('onnx-community/whisper-tiny.en')
  })

  it('falls back to the app default for an unknown id', () => {
    expect(findAsrModel('not-a-real-model').id).toBe(DEFAULT_ASR_MODEL)
  })

  it('falls back to the app default for undefined/null/empty input', () => {
    expect(findAsrModel(undefined).id).toBe(DEFAULT_ASR_MODEL)
    expect(findAsrModel(null).id).toBe(DEFAULT_ASR_MODEL)
    expect(findAsrModel('').id).toBe(DEFAULT_ASR_MODEL)
  })

  it('lists every catalog model with a positive size', () => {
    expect(ASR_MODELS.length).toBeGreaterThanOrEqual(3)
    for (const m of ASR_MODELS) {
      expect(m.sizeMb).toBeGreaterThan(0)
      expect(m.label).toBeTruthy()
    }
  })

  it('includes the app default model in the catalog', () => {
    expect(ASR_MODELS.some((m) => m.id === DEFAULT_ASR_MODEL)).toBe(true)
  })
})
