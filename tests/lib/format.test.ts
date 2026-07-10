import { describe, expect, it } from 'vitest'
import { estimatedRam, formatBytes, formatCount, formatEta, formatSpeed } from '../../src/lib/format'

describe('format helpers', () => {
  it('formats bytes as GB/MB', () => {
    expect(formatBytes(4_700_000_000)).toBe('4.7 GB')
    expect(formatBytes(300_000_000)).toBe('300 MB')
    expect(formatBytes(undefined)).toBe('—')
  })
  it('formats download speed', () => {
    expect(formatSpeed(3_200_000)).toBe('3.2 MB/s')
    expect(formatSpeed(45_000)).toBe('45 KB/s')
    expect(formatSpeed(0)).toBe('')
  })
  it('formats ETA', () => {
    expect(formatEta(42)).toBe('42s left')
    expect(formatEta(95)).toBe('1m 35s left')
    expect(formatEta(0)).toBe('')
  })
  it('formats compact counts', () => {
    expect(formatCount(1234)).toBe('1.2K')
    expect(formatCount(2_500_000)).toBe('2.5M')
  })
  it('estimates RAM from model size', () => {
    expect(estimatedRam(8_300_000_000)).toBe('10 GB') // 8.3 * 1.2 = 9.96 → ceil
  })
})
