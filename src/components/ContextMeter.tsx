import { useEffect, useState } from 'react'
import { contextUsage, formatTokens } from '../lib/context'
import { getModelContextLength } from '../lib/ollama'
import type { MessageStat } from '../lib/stats'

const LEVEL_TEXT = { ok: 'text-muted', warn: 'text-amber-300', critical: 'text-rose-300' } as const
const LEVEL_BAR = { ok: 'bg-iris', warn: 'bg-amber-500', critical: 'bg-rose-500' } as const

/**
 * Compact context-window readout for the docked composer. The number shown is
 * MEASURED from the last response (promptTokens + completionTokens — the real
 * size of what the next turn carries), never an estimate of the untokenized
 * text sitting in the composer, so it can't overpromise headroom that isn't
 * actually there.
 */
export function ContextMeter({
  model,
  numCtx,
  stat,
}: {
  model: string
  numCtx: number
  /** The last assistant message's stat. Undefined before the first reply. */
  stat?: MessageStat
}) {
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

  // Deliberately not "trained max": parseContextLength falls back to a num_ctx
  // Modelfile line, which is a configured value rather than the model's ceiling.
  const trainedHint = trainedMax
    ? ` This model reports a maximum context of ${trainedMax.toLocaleString()} tokens.`
    : ''

  if (!stat || stat.promptTokens === undefined) {
    return (
      <div
        className="flex items-center gap-1.5 px-1 font-mono text-[11px] text-muted/60"
        title={`Context usage appears here after the first reply — measured from Ollama's response, never estimated from what's still in the composer.${trainedHint}`}
      >
        <span>—</span>
        <span className="font-sans text-muted/50">context</span>
      </div>
    )
  }

  const usage = contextUsage(stat.promptTokens, stat.completionTokens, numCtx)
  const pctLabel = Math.round(usage.pct * 100)

  return (
    <div
      className="flex items-center gap-2 px-1"
      title={
        `Context used: ${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} tokens ` +
        `(${pctLabel}%), measured from the last response.${trainedHint}`
      }
    >
      <span className={`font-mono text-[11px] ${LEVEL_TEXT[usage.level]}`}>
        {formatTokens(usage.used)} / {formatTokens(usage.limit)} · {pctLabel}%
      </span>
      <div className="h-1 w-20 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all ${LEVEL_BAR[usage.level]}`}
          style={{ width: `${Math.min(100, usage.pct * 100)}%` }}
        />
      </div>
    </div>
  )
}
