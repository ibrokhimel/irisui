import { useEffect, useState } from 'react'
import { formatTokens } from '../lib/context'
import { getModelContextLength } from '../lib/ollama'
import type { AutoReason } from '../lib/kvCache'
import type { ContextVerdict } from '../lib/contextGuard'
import { effectiveRamGb, hasRamProfile } from '../lib/hardware'

const LEVEL_TEXT: Record<ContextVerdict, string> = {
  ok: 'text-muted',
  warn: 'text-amber-300',
  full: 'text-rose-300',
}
const LEVEL_BAR: Record<ContextVerdict, string> = {
  ok: 'bg-iris',
  warn: 'bg-amber-500',
  full: 'bg-rose-500',
}

export interface ContextState {
  used: number
  limit: number
  projected: number
  verdict: ContextVerdict
  historyFull: boolean
  reason?: AutoReason
  truncated: boolean
}

/**
 * Explain WHY the window is this size. An unexplained number invites the user to
 * assume we picked it arbitrarily — and in the 'unknown' case we effectively
 * did, which they deserve to know.
 */
function explainReason(reason: AutoReason | undefined, trainedMax: number | undefined): string {
  const max = trainedMax ? formatTokens(trainedMax) : 'an unknown amount'
  const ram = `${effectiveRamGb()} GB`
  const caveat = hasRamProfile() ? '' : ' (assumed — set your RAM in Settings for a better fit)'
  switch (reason) {
    case 'ram-limited':
      return `Auto: sized to your ${ram}${caveat} of RAM. The model supports up to ${max}, but that much KV cache would not fit in memory.`
    case 'model-max':
      return `Auto: the most this model supports (${max}) — your RAM can afford it.`
    case 'floor':
      return `Auto: the minimum window. This model's weights leave almost no room for a KV cache on ${ram}${caveat}.`
    case 'unknown':
      return "Ollama's default — this model doesn't report the geometry needed to size the window, so we didn't guess."
    case 'manual':
      return `Set by you. This model supports up to ${max}.`
    default:
      return ''
  }
}

/**
 * Context-window readout for the docked composer.
 *
 * The number shown is MEASURED from the last response (promptTokens +
 * completionTokens — the real size of what the next turn carries), never an
 * estimate of the untokenized text sitting in the composer, so it can't
 * overpromise headroom that isn't actually there.
 */
export function ContextMeter({ model, context }: { model: string; context: ContextState }) {
  const [trainedMax, setTrainedMax] = useState<number | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setTrainedMax(undefined)
    if (model) {
      void getModelContextLength(model).then((n) => {
        if (!cancelled) setTrainedMax(n)
      })
    }
    return () => {
      cancelled = true
    }
  }, [model])

  const { used, limit, verdict, reason, truncated } = context

  // The window hasn't resolved yet (/api/show is still in flight).
  if (limit <= 0) {
    return (
      <div className="flex items-center gap-1.5 px-1 font-mono text-[11px] text-muted/60">
        <span>—</span>
        <span className="font-sans text-muted/50">context</span>
      </div>
    )
  }

  const why = explainReason(reason, trainedMax)
  const fraction = Math.min(1, used / limit)
  const pct = Math.round(fraction * 100)
  const title =
    used > 0
      ? `Context used: ${used.toLocaleString()} / ${limit.toLocaleString()} tokens (${pct}%), measured from the last response. ${why}`
      : `Context window: ${limit.toLocaleString()} tokens. Usage appears after the first reply. ${why}`

  return (
    <div className="flex items-center gap-2 px-1" title={title}>
      <span className={`font-mono text-[11px] ${LEVEL_TEXT[verdict]}`}>
        {used > 0 ? `${formatTokens(used)} / ${formatTokens(limit)} · ${pct}%` : formatTokens(limit)}
      </span>
      <div className="h-1 w-20 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all ${LEVEL_BAR[verdict]}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      {truncated && (
        <span
          className="text-[11px] font-medium text-rose-300"
          title="Ollama dropped the oldest messages to fit this reply into the window — it answered without them."
        >
          history truncated
        </span>
      )}
    </div>
  )
}
