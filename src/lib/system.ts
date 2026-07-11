/**
 * Client side of the System Monitor. `/api/system` is served by the Vite
 * middleware in scripts/systemStatsPlugin.ts (dev + preview only) — when the
 * app is hosted without it, fetchSystemStats rejects and the panel degrades
 * to Ollama-derived data.
 */

export interface GpuStats {
  name: string
  utilPct: number
  vramUsedMb: number
  vramTotalMb: number
  tempC: number
}

export interface SystemSnapshot {
  gpu: GpuStats | null
  cpu: { utilPct: number; cores: number }
  ram: { usedBytes: number; totalBytes: number }
  disk: { freeBytes: number; totalBytes: number } | null
}

export const GIB = 2 ** 30

export async function fetchSystemStats(signal?: AbortSignal): Promise<SystemSnapshot> {
  const res = await fetch('/api/system', { signal })
  if (!res.ok) throw new Error(`system stats unavailable (${res.status})`)
  return (await res.json()) as SystemSnapshot
}

/** Split loaded models' memory into GPU-resident vs spilled-to-RAM bytes. */
export function vramFit(
  models: { size: number; size_vram: number }[],
): { inVramBytes: number; sharedBytes: number } {
  let inVramBytes = 0
  let sharedBytes = 0
  for (const m of models) {
    const size = m.size > 0 ? m.size : 0
    const inVram = Math.max(0, Math.min(m.size_vram, size))
    inVramBytes += inVram
    sharedBytes += size - inVram
  }
  return { inVramBytes, sharedBytes }
}

const TEN_YEARS_MS = 10 * 365 * 24 * 3600 * 1000

/**
 * Countdown label for Ollama's expires_at. keep_alive -1 reports a far-future
 * timestamp and the Go zero time is far past — both mean "not scheduled to
 * unload", rendered as "pinned".
 */
export function formatTimeLeft(expiresAt: string | undefined, nowMs: number): string {
  if (!expiresAt) return ''
  const t = Date.parse(expiresAt)
  if (Number.isNaN(t)) return ''
  const delta = t - nowMs
  if (delta > TEN_YEARS_MS || delta < -60_000) return 'pinned'
  if (delta < 60_000) return '<1m left'
  const mins = Math.floor(delta / 60_000)
  if (mins < 60) return `${mins}m left`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m left` : `${h}h left`
}

/** Rolling sample buffer for sparklines (immutable, capped). */
export function pushSample(history: number[], value: number, cap = 30): number[] {
  const next = [...history, value]
  return next.length > cap ? next.slice(next.length - cap) : next
}

// ── panel open/closed persistence ─────────────────────────────────────────
const MONITOR_KEY = 'irisui.monitor'

export function loadMonitorOpen(): boolean {
  try {
    const raw = localStorage.getItem(MONITOR_KEY)
    if (!raw) return true
    return (JSON.parse(raw) as { open?: boolean }).open !== false
  } catch {
    return true
  }
}

export function saveMonitorOpen(open: boolean): void {
  try {
    localStorage.setItem(MONITOR_KEY, JSON.stringify({ open }))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
