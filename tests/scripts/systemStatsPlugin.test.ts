import { describe, expect, it } from 'vitest'
import { cpuUtilBetween, parseNvidiaSmi } from '../../scripts/systemStatsPlugin'

describe('parseNvidiaSmi', () => {
  it('parses a nounits CSV line', () => {
    expect(parseNvidiaSmi('NVIDIA GeForce RTX 3060, 62, 8396, 12288, 58')).toEqual({
      name: 'NVIDIA GeForce RTX 3060',
      utilPct: 62, vramUsedMb: 8396, vramTotalMb: 12288, tempC: 58,
    })
  })

  it('returns null for a short or empty line', () => {
    expect(parseNvidiaSmi('')).toBeNull()
    expect(parseNvidiaSmi('name, 1, 2')).toBeNull()
  })

  it('returns null when a numeric field is not a number', () => {
    expect(parseNvidiaSmi('GPU, N/A, 8396, 12288, 58')).toBeNull()
  })
})

describe('cpuUtilBetween', () => {
  const cpu = (user: number, idle: number) => ({ user, nice: 0, sys: 0, idle, irq: 0 })

  it('computes busy percentage from time deltas', () => {
    const prev = [cpu(100, 100), cpu(100, 100)]
    const next = [cpu(150, 150), cpu(200, 100)]
    // deltas: core0 busy 50 idle 50, core1 busy 100 idle 0 → busy 150 / total 200 = 75%
    expect(cpuUtilBetween(prev, next)).toBe(75)
  })

  it('returns 0 when there is no previous sample or no elapsed time', () => {
    expect(cpuUtilBetween([], [cpu(1, 1)])).toBe(0)
    expect(cpuUtilBetween([cpu(1, 1)], [cpu(1, 1)])).toBe(0)
  })

  it('clamps into 0..100', () => {
    expect(cpuUtilBetween([cpu(0, 100)], [cpu(0, 200)])).toBe(0)
    expect(cpuUtilBetween([cpu(0, 100)], [cpu(500, 100)])).toBe(100)
  })
})
