import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSystemStats } from '../../src/lib/system'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

const SNAPSHOT = {
  gpu: { name: 'RTX 4090', utilPct: 42, vramUsedMb: 8000, vramTotalMb: 24564, tempC: 61 },
  cpu: { utilPct: 12, cores: 16 },
  ram: { usedBytes: 17_000_000_000, totalBytes: 34_000_000_000 },
  disk: { freeBytes: 500_000_000_000, totalBytes: 2_000_000_000_000 },
}

afterEach(() => {
  vi.unstubAllGlobals()
  invoke.mockReset()
})

describe('fetchSystemStats', () => {
  it('rejects outside Tauri so the panel degrades to Ollama-derived data', async () => {
    await expect(fetchSystemStats()).rejects.toThrow(/desktop/i)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('invokes the system_stats command inside Tauri', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    invoke.mockResolvedValue(SNAPSHOT)
    await expect(fetchSystemStats()).resolves.toEqual(SNAPSHOT)
    expect(invoke).toHaveBeenCalledWith('system_stats')
  })
})
