import { describe, expect, it } from 'vitest'
import { RAM_OPTIONS, detectHardware } from '../../src/lib/hardware'

describe('detectHardware', () => {
  it('uses deviceMemory + cores when present', () => {
    expect(detectHardware({ deviceMemory: 8, hardwareConcurrency: 12 })).toEqual({ ramGb: 8, cores: 12, source: 'detected' })
  })
  it('returns null when nothing is detectable', () => {
    expect(detectHardware({})).toBeNull()
  })
})

describe('RAM_OPTIONS', () => {
  it('offers the standard tiers', () => {
    expect(RAM_OPTIONS).toEqual([8, 16, 32, 64, 128])
  })
})
