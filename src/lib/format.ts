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
