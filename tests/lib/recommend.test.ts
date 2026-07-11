import { describe, expect, it } from 'vitest'
import { MODEL_CATALOG } from '../../src/lib/modelCatalog'
import { modelFit, parseApproxGb, recommendModels } from '../../src/lib/recommend'

describe('parseApproxGb', () => {
  it('parses catalog size strings', () => {
    expect(parseApproxGb('~4.9 GB')).toBe(4.9)
    expect(parseApproxGb('~0.05 GB')).toBe(0.05)
    expect(parseApproxGb('nonsense')).toBe(0)
  })
})

describe('modelFit', () => {
  it('classifies against RAM with the 1.2x overhead rule', () => {
    expect(modelFit(4.9e9, 16)).toBe('comfortable') // needs ~5.9GB of 16
    expect(modelFit(8.3e9, 16)).toBe('tight') // needs ~10GB of 16 (62%→90% band)
    expect(modelFit(20e9, 16)).toBe('too-large') // needs ~24GB
  })
})

describe('recommendModels', () => {
  it('returns catalog-installable picks per category', () => {
    const recs = recommendModels(16)
    expect(recs.length).toBeGreaterThanOrEqual(4)
    const names = new Set(MODEL_CATALOG.map((m) => m.name))
    for (const r of recs) expect(names.has(r.name)).toBe(true)
    expect(recs.map((r) => r.category)).toContain('Best overall')
  })
  it('never recommends something the machine cannot run', () => {
    for (const ram of [8, 16, 32, 64]) {
      for (const r of recommendModels(ram)) {
        const m = MODEL_CATALOG.find((c) => c.name === r.name)!
        expect(modelFit(parseApproxGb(m.approxSize) * 1e9, ram)).not.toBe('too-large')
      }
    }
  })
})

describe('isLikelyEmbeddingModel', () => {
  it('flags embedding models and spares chat models', async () => {
    const { isLikelyEmbeddingModel } = await import('../../src/lib/modelCatalog')
    expect(isLikelyEmbeddingModel('all-minilm:latest')).toBe(true)
    expect(isLikelyEmbeddingModel('nomic-embed-text')).toBe(true)
    expect(isLikelyEmbeddingModel('mxbai-embed-large:latest')).toBe(true)
    expect(isLikelyEmbeddingModel('qwen2.5:0.5b')).toBe(false)
    expect(isLikelyEmbeddingModel('sera:latest')).toBe(false)
  })
})
