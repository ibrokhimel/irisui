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

export const FALLBACK_RAM_GB = 8

/**
 * RAM to budget the context window against. A saved profile always wins:
 * `navigator.deviceMemory` is capped at 8 GB by spec, so detection silently
 * under-reports on every real workstation and would cost the user most of the
 * context window they paid for. When we have nothing, assume 8 GB and say so in
 * the UI rather than pretending we know.
 */
export function effectiveRamGb(): number {
  return loadHardwareProfile()?.ramGb ?? detectHardware()?.ramGb ?? FALLBACK_RAM_GB
}

/** Whether the RAM figure above is a real answer or just our fallback guess. */
export function hasRamProfile(): boolean {
  return loadHardwareProfile() !== null || detectHardware() !== null
}
