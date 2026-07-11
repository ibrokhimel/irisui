export interface HardwareProfile { ramGb: number; cores: number | null; source: 'manual' | 'detected' }
export const RAM_OPTIONS = [8, 16, 32, 64, 128]
export const KEY = 'irisui.hardware'

export function detectHardware(
  nav: { deviceMemory?: number; hardwareConcurrency?: number } =
    (typeof navigator !== 'undefined' ? (navigator as never) : {}),
): HardwareProfile | null {
  const ram = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0
  if (!ram) return null
  return { ramGb: ram, cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null, source: 'detected' }
}

export function loadHardwareProfile(): HardwareProfile | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<HardwareProfile>
    if (typeof p.ramGb !== 'number' || p.ramGb <= 0) return null
    return { ramGb: p.ramGb, cores: typeof p.cores === 'number' ? p.cores : null, source: p.source === 'detected' ? 'detected' : 'manual' }
  } catch { return null }
}

export function saveHardwareProfile(p: HardwareProfile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* ignore */ }
}
