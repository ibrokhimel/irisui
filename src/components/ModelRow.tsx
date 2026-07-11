import { useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ChevronDown, Gauge, Star, Trash2 } from 'lucide-react'
import type { OllamaModel } from '../types'
import type { BenchmarkResult, ModelDetails } from '../lib/ollama'
import { benchmarkModel, showModel } from '../lib/ollama'
import { estimatedRam, formatBytes, formatDate } from '../lib/format'
import type { FitVerdict } from '../lib/recommend'

export function ModelRow({
  model,
  isDefault,
  isFavorite,
  onToggleFavorite,
  onSetDefault,
  onDelete,
  fit,
}: {
  model: OllamaModel
  isDefault: boolean
  isFavorite: boolean
  onToggleFavorite: (name: string) => void
  onSetDefault: (name: string) => void
  onDelete: (model: OllamaModel) => void
  fit?: FitVerdict | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [details, setDetails] = useState<ModelDetails | null>(null)
  const [detailsError, setDetailsError] = useState('')
  const [bench, setBench] = useState<BenchmarkResult | null>(null)
  const [benching, setBenching] = useState(false)
  const benchAbort = useRef<AbortController | null>(null)

  const toggleDetails = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && !details && !detailsError) {
      try {
        setDetails(await showModel(model.name))
      } catch (e) {
        setDetailsError(e instanceof Error ? e.message : 'Failed to load details')
      }
    }
  }

  const runBenchmark = async () => {
    if (benching) return
    setBenching(true)
    setBench(null)
    const controller = new AbortController()
    benchAbort.current = controller
    try {
      setBench(await benchmarkModel({ name: model.name, signal: controller.signal }))
    } catch {
      /* aborted or failed — leave bench null */
    } finally {
      setBenching(false)
      benchAbort.current = null
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel2/50">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => onToggleFavorite(model.name)}
          aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
          className="shrink-0"
        >
          <Star
            className={
              'h-4 w-4 transition ' +
              (isFavorite ? 'fill-amber-400 text-amber-400' : 'text-muted hover:text-fg')
            }
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-fg">{model.name}</span>
            {isDefault && (
              <span className="rounded-md bg-iris/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-iris">
                Default
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
            <span>{formatBytes(model.size)}</span>
            <span>·</span>
            <span>Modified {formatDate(model.modified_at)}</span>
            {model.details?.parameter_size && (
              <>
                <span>·</span>
                <span>{model.details.parameter_size}</span>
              </>
            )}
            {model.details?.quantization_level && (
              <>
                <span>·</span>
                <span>{model.details.quantization_level}</span>
              </>
            )}
            <span>·</span>
            <span title="Rough RAM needed to run this model (approximate, based on size)">
              ≈{estimatedRam(model.size)} RAM
            </span>
            {fit && (
              <>
                <span>·</span>
                <span className={fit === 'comfortable' ? 'text-emerald-400' : fit === 'tight' ? 'text-amber-400' : 'text-rose-400'}>
                  {fit === 'comfortable' ? 'Runs well' : fit === 'tight' ? 'Tight fit' : 'Too large'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!isDefault && (
            <button
              onClick={() => onSetDefault(model.name)}
              className="hidden rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-iris/40 hover:text-fg sm:block"
            >
              Set default
            </button>
          )}
          <button
            onClick={runBenchmark}
            disabled={benching}
            title="Benchmark generation speed"
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-iris/40 hover:text-fg disabled:opacity-60"
          >
            <Gauge className="h-3.5 w-3.5" />
            {benching ? 'Running…' : bench ? `${bench.tokensPerSec.toFixed(1)} tok/s` : 'Benchmark'}
          </button>
          <button
            onClick={toggleDetails}
            aria-label="Toggle details"
            aria-expanded={expanded}
            className="rounded-lg p-1.5 text-muted transition hover:bg-panel hover:text-fg"
          >
            <ChevronDown className={'h-4 w-4 transition ' + (expanded ? 'rotate-180' : '')} />
          </button>
          <button
            onClick={() => onDelete(model)}
            aria-label="Delete model"
            className="rounded-lg p-1.5 text-muted transition hover:bg-rose-500/10 hover:text-rose-300"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-line px-4 py-3 text-xs">
              {isDefault ? null : (
                <button
                  onClick={() => onSetDefault(model.name)}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-muted transition hover:border-iris/40 hover:text-fg sm:hidden"
                >
                  Set as default
                </button>
              )}
              {bench && (
                <p className="text-muted">
                  Speed:{' '}
                  <span className="text-fg">{bench.tokensPerSec.toFixed(1)} tok/s</span>, first token{' '}
                  {Math.round(bench.ttftMs)} ms ({bench.evalCount} tokens generated).
                </p>
              )}
              {detailsError ? (
                <p className="text-rose-300">{detailsError}</p>
              ) : !details ? (
                <p className="text-muted">Loading details…</p>
              ) : (
                <Details details={details} model={model} />
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function Details({ details, model }: { details: ModelDetails; model: OllamaModel }) {
  const d = (details.details ?? {}) as Record<string, unknown>
  const rows: [string, string][] = [
    ['Family', model.details?.family ?? str(d.family)],
    ['Parameters', model.details?.parameter_size ?? str(d.parameter_size)],
    ['Quantization', model.details?.quantization_level ?? str(d.quantization_level)],
    ['Format', model.details?.format ?? str(d.format)],
  ]
  const shown = rows.filter(([, v]) => v)

  return (
    <div className="space-y-2">
      {shown.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {shown.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="truncate text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {details.parameters && (
        <pre className="max-h-40 overflow-auto rounded-lg border border-line bg-[var(--color-code-bg)] p-2 text-[11px] leading-relaxed text-[#e6e1d8]">
          {details.parameters}
        </pre>
      )}
    </div>
  )
}
