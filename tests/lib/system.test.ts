import { afterEach, describe, expect, it, vi } from 'vitest'
// fetchSystemStats now goes through the `system_stats` Tauri command; it is
// covered in system-invoke.test.ts, which needs a hoisted vi.mock of
// @tauri-apps/api/core and so must live in its own file.
import {
  formatTimeLeft, loadMonitorOpen, pushSample, saveMonitorOpen, vramFit,
} from '../../src/lib/system'

afterEach(() => vi.unstubAllGlobals())

describe('vramFit', () => {
  it('sums VRAM-resident and shared portions across models', () => {
    const fit = vramFit([
      { size: 8_000_000_000, size_vram: 7_600_000_000 },
      { size: 1_200_000_000, size_vram: 1_200_000_000 },
    ])
    expect(fit.inVramBytes).toBe(8_800_000_000)
    expect(fit.sharedBytes).toBe(400_000_000)
  })

  it('clamps size_vram larger than size (never negative shared)', () => {
    const fit = vramFit([{ size: 1_000, size_vram: 2_000 }])
    expect(fit.inVramBytes).toBe(1_000)
    expect(fit.sharedBytes).toBe(0)
  })

  it('returns zeros for an empty list', () => {
    expect(vramFit([])).toEqual({ inVramBytes: 0, sharedBytes: 0 })
  })
})

describe('formatTimeLeft', () => {
  const now = Date.parse('2026-07-11T12:00:00Z')

  it('renders minutes', () => {
    expect(formatTimeLeft('2026-07-11T12:11:00Z', now)).toBe('11m left')
  })

  it('renders hours + minutes', () => {
    expect(formatTimeLeft('2026-07-11T13:12:00Z', now)).toBe('1h 12m left')
  })

  it('renders whole hours without a minutes part', () => {
    expect(formatTimeLeft('2026-07-11T14:00:00Z', now)).toBe('2h left')
  })

  it('treats far-future expiry (keep_alive -1) as pinned', () => {
    expect(formatTimeLeft('2100-01-01T00:00:00Z', now)).toBe('pinned')
  })

  it('treats the Go zero time as pinned', () => {
    expect(formatTimeLeft('0001-01-01T00:00:00Z', now)).toBe('pinned')
  })

  it('renders <1m just before expiry', () => {
    expect(formatTimeLeft('2026-07-11T12:00:20Z', now)).toBe('<1m left')
  })

  it('returns empty string for missing or unparseable input', () => {
    expect(formatTimeLeft(undefined, now)).toBe('')
    expect(formatTimeLeft('not-a-date', now)).toBe('')
  })
})

describe('pushSample', () => {
  it('appends and caps at 30 by default', () => {
    let h: number[] = []
    for (let i = 0; i < 35; i++) h = pushSample(h, i)
    expect(h).toHaveLength(30)
    expect(h[0]).toBe(5)
    expect(h[29]).toBe(34)
  })

  it('respects a custom cap', () => {
    expect(pushSample([1, 2, 3], 4, 3)).toEqual([2, 3, 4])
  })
})

describe('monitor open persistence', () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial))
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
  }

  it('defaults to open when nothing is stored', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(loadMonitorOpen()).toBe(true)
  })

  it('round-trips a closed state', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveMonitorOpen(false)
    expect(loadMonitorOpen()).toBe(false)
  })

  it('falls back to open on corrupt JSON', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'irisui.monitor': '{nope' }))
    expect(loadMonitorOpen()).toBe(true)
  })
})
