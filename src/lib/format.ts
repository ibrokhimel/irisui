/** Human-readable byte size (GB/MB). */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—'
  const gb = bytes / 1e9
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${Math.round(bytes / 1e6)} MB`
}

/** Localized short date from an ISO string. */
export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Rough RAM needed to run a model, derived from its on-disk size (~1.2x for
 * context / KV-cache overhead). Deliberately approximate — a hint, not a spec.
 */
export function estimatedRam(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—'
  const gb = (bytes / 1e9) * 1.2
  return gb < 1 ? `${gb.toFixed(1)} GB` : `${Math.ceil(gb)} GB`
}

/** Download speed from bytes/second. */
export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return ''
  const mb = bytesPerSec / 1e6
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`
  return `${Math.max(1, Math.round(bytesPerSec / 1e3))} KB/s`
}

/** Compact count (1234 -> "1.2K", 1200000 -> "1.2M"). */
export function formatCount(n: number): string {
  if (!n || n < 0) return '0'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}

/** Rough remaining-time label. */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `${Math.round(seconds)}s left`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s left`
}

/** One-decimal GB numeral for "8.2 / 12 GB" pairs; whole values drop the decimal. */
export function formatGbFigure(gb: number): string {
  const v = Math.round(gb * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
