import { describe, expect, it, vi } from 'vitest'
import { createSnapshotCache, cpuUtilBetween, parseNvidiaSmi } from '../../scripts/systemStatsPlugin'

/** A promise plus its resolve/reject, for controlling settlement from the test. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

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

describe('createSnapshotCache', () => {
  it('returns the cached value without recollecting within the TTL', async () => {
    let time = 0
    let calls = 0
    const collect = vi.fn(async () => { calls++; return `v${calls}` })
    const getSnapshot = createSnapshotCache(collect, 1000, () => time)

    const first = await getSnapshot()
    time += 500 // still inside the 1000ms TTL
    const second = await getSnapshot()

    expect(collect).toHaveBeenCalledTimes(1)
    expect(first).toBe('v1')
    expect(second).toBe('v1')
  })

  it('shares a single in-flight collection across concurrent callers', async () => {
    const d = deferred<string>()
    const collect = vi.fn(() => d.promise)
    const getSnapshot = createSnapshotCache(collect, 1000)

    const calls = [getSnapshot(), getSnapshot(), getSnapshot(), getSnapshot()]
    d.resolve('shared')
    const results = await Promise.all(calls)

    expect(collect).toHaveBeenCalledTimes(1)
    expect(results).toEqual(['shared', 'shared', 'shared', 'shared'])
  })

  it('collects a fresh value after the TTL elapses', async () => {
    let time = 0
    let calls = 0
    const collect = vi.fn(async () => { calls++; return `v${calls}` })
    const getSnapshot = createSnapshotCache(collect, 1000, () => time)

    const first = await getSnapshot()
    time += 1000 // at the TTL boundary: `now() - at < ttlMs` must be false
    const second = await getSnapshot()

    expect(collect).toHaveBeenCalledTimes(2)
    expect(first).toBe('v1')
    expect(second).toBe('v2')
  })

  it('clears the in-flight state on rejection so the next call retries', async () => {
    let attempt = 0
    const collect = vi.fn(async () => {
      attempt++
      if (attempt === 1) throw new Error('boom')
      return 'recovered'
    })
    const getSnapshot = createSnapshotCache(collect, 1000)

    await expect(getSnapshot()).rejects.toThrow('boom')
    await expect(getSnapshot()).resolves.toBe('recovered')
    expect(collect).toHaveBeenCalledTimes(2)
  })
})
