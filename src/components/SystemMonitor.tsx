import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronUp, Clock, HardDrive, RefreshCw, Thermometer } from 'lucide-react'
import type { MessageStat } from '../lib/stats'
import { listStats } from '../lib/statsStore'
import { useSystemMonitor } from '../hooks/useSystemMonitor'
import { GIB, formatTimeLeft, pushSample, vramFit } from '../lib/system'
import { formatBytes, formatGbFigure } from '../lib/format'
import { Sparkline } from './Sparkline'

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={'rounded-xl border border-line bg-panel2/40 p-3 ' + className}>{children}</div>
}

function CardLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-[11px] font-medium text-muted">{children}</p>
}

function Bar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full bg-iris transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-muted">{Math.round(clamped)}%</span>
    </div>
  )
}

export function SystemMonitor({
  selectedModel, isStreaming, lastStat, onCollapse,
}: {
  selectedModel: string
  isStreaming: boolean
  lastStat?: MessageStat
  onCollapse: () => void
}) {
  const mon = useSystemMonitor({ isStreaming })

  // Tokens/sec history: seed from the stats store (last 20 completed
  // generations), then append as each new response finishes. lastStat's object
  // identity changes exactly once per completed generation.
  //
  // The seed (IndexedDB read) and the append (keyed on lastStat) both run in
  // the mount flush, and the seed is async — so on a mount where lastStat is
  // already populated (e.g. reopening a collapsed panel), the append can land
  // before the seed resolves. The seed therefore MERGES in front of whatever
  // has appended since mount rather than choosing one or the other: these are
  // disjoint sets (history predating this mount vs. generations completing
  // after it), so concatenation combines them instead of discarding either.
  // The mount-time stat is excluded from the append (see mountStatRef below)
  // since the seed will already carry it — otherwise it would double-count.
  const [tpsHistory, setTpsHistory] = useState<number[]>([])
  const mountStatRef = useRef(lastStat)
  useEffect(() => {
    let cancelled = false
    void listStats(20).then((stats) => {
      if (cancelled) return
      const seeded = stats.map((s) => s.tokensPerSec).filter((n) => n > 0).reverse()
      setTpsHistory((h) => [...seeded, ...h].slice(-20))
    }).catch(() => { /* stats are best-effort */ })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (lastStat === mountStatRef.current) return
    if (lastStat && lastStat.tokensPerSec > 0) {
      setTpsHistory((h) => pushSample(h, lastStat.tokensPerSec, 20))
    }
  }, [lastStat])

  const gpu = mon.system?.gpu ?? null
  const fit = vramFit(mon.running)
  const totalLoaded = mon.running.reduce((sum, m) => sum + m.size, 0)
  const now = Date.now()
  const lastTps = tpsHistory.length > 0 ? tpsHistory[tpsHistory.length - 1] : null

  return (
    <aside className="hidden h-full w-80 shrink-0 flex-col border-l border-line bg-panel lg:flex">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">System Monitor</h2>
        <button
          onClick={onCollapse}
          aria-label="Collapse system monitor"
          className="rounded-lg p-1.5 text-muted transition hover:bg-panel2 hover:text-fg"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* Hero: VRAM when GPU stats exist, model-memory fallback otherwise */}
        {gpu ? (
          <Card>
            <CardLabel>
              VRAM{' '}
              <span
                className="text-muted/70"
                title="How much of the GPU's memory is in use. 'Model fit' shows how much of the loaded models sits in VRAM vs spilled to system RAM — spilling slows generation dramatically."
              >
                ({gpu.name})
              </span>
            </CardLabel>
            <p className="text-2xl font-semibold tabular-nums text-fg">
              {formatGbFigure(gpu.vramUsedMb / 1024)}
              <span className="text-sm font-normal text-muted"> / {formatGbFigure(gpu.vramTotalMb / 1024)} GB</span>
            </p>
            <div className="mt-2">
              <Bar pct={gpu.vramTotalMb > 0 ? (gpu.vramUsedMb / gpu.vramTotalMb) * 100 : 0} />
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {mon.running.length === 0
                ? 'No models loaded'
                : `Model fit: ${formatBytes(fit.inVramBytes)} in VRAM${
                    fit.sharedBytes > 0 ? ` + ${formatBytes(fit.sharedBytes)} shared` : ''
                  }`}
            </p>
          </Card>
        ) : mon.running.length > 0 ? (
          <Card>
            <CardLabel>Model memory</CardLabel>
            <p className="text-2xl font-semibold tabular-nums text-fg">
              {formatGbFigure(totalLoaded / GIB)}
              <span className="text-sm font-normal text-muted"> GB</span>
            </p>
            <p className="mt-1 text-[11px] text-muted">
              across {mon.running.length} loaded model{mon.running.length === 1 ? '' : 's'}
            </p>
          </Card>
        ) : null}

        {/* 2-up utilization grid */}
        <div className="grid grid-cols-2 gap-3">
          {gpu && (
            <Card>
              <CardLabel>GPU Utilization</CardLabel>
              <p className="text-xl font-semibold tabular-nums text-fg">{gpu.utilPct}%</p>
              <Sparkline values={mon.gpuHistory} />
            </Card>
          )}
          {mon.system && (
            <Card>
              <CardLabel>RAM Usage</CardLabel>
              <p className="text-xl font-semibold tabular-nums text-fg">
                {formatGbFigure(mon.system.ram.usedBytes / GIB)}
                <span className="text-xs font-normal text-muted">
                  {' '}/ {formatGbFigure(mon.system.ram.totalBytes / GIB)} GB
                </span>
              </p>
              <div className="mt-2">
                <Bar
                  pct={mon.system.ram.totalBytes > 0
                    ? (mon.system.ram.usedBytes / mon.system.ram.totalBytes) * 100
                    : 0}
                />
              </div>
            </Card>
          )}
          {mon.system && (
            <Card>
              <CardLabel>CPU Utilization</CardLabel>
              <p className="text-xl font-semibold tabular-nums text-fg">{mon.system.cpu.utilPct}%</p>
              <Sparkline values={mon.cpuHistory} />
            </Card>
          )}
          <Card>
            <CardLabel>Tokens / sec</CardLabel>
            <p className="text-xl font-semibold tabular-nums text-fg">
              {lastTps !== null ? lastTps.toFixed(1) : '—'}
              {lastTps !== null && <span className="text-xs font-normal text-muted"> t/s</span>}
            </p>
            <Sparkline values={tpsHistory} />
          </Card>
        </div>

        {/* Loaded models */}
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <p className="text-xs font-semibold text-fg">Loaded Models</p>
            <p className="text-[11px] text-muted">
              {mon.running.length > 0
                ? `${mon.running.length} model${mon.running.length === 1 ? '' : 's'} · ${formatBytes(totalLoaded)}`
                : mon.ollamaUp ? 'none' : '—'}
            </p>
          </div>
          {mon.running.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted">
              {mon.ollamaUp ? 'No models loaded' : 'Ollama is offline'}
            </p>
          ) : (
            <ul>
              {mon.running.map((m) => (
                <li
                  key={m.name}
                  className="flex items-center gap-2 border-b border-line px-3 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-xs font-medium text-fg">
                      <span className="truncate">{m.name}</span>
                      {m.name === selectedModel && (
                        <span className="shrink-0 rounded bg-iris/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-iris">
                          Active
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted">{formatBytes(m.size)}</p>
                  </div>
                  <p className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted">
                    <Clock className="h-3 w-3" aria-hidden />
                    {formatTimeLeft(m.expires_at, now) || '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Mini-card row */}
        <div className="grid grid-cols-3 gap-3">
          {gpu && (
            <Card className="p-2.5">
              <CardLabel>GPU Temp</CardLabel>
              <p className="flex items-center gap-1 text-sm font-semibold tabular-nums text-fg">
                <Thermometer className="h-3.5 w-3.5 text-muted" aria-hidden />
                {gpu.tempC} °C
              </p>
            </Card>
          )}
          {mon.system?.disk && (
            <Card className="p-2.5">
              <CardLabel>Disk Free</CardLabel>
              <p className="flex items-center gap-1 text-sm font-semibold tabular-nums text-fg">
                <HardDrive className="h-3.5 w-3.5 text-muted" aria-hidden />
                {formatGbFigure(mon.system.disk.freeBytes / GIB)} GB
              </p>
              <p className="text-[10px] text-muted">Models drive</p>
            </Card>
          )}
          <Card className="p-2.5">
            <CardLabel>Ollama</CardLabel>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <span
                className={
                  'h-1.5 w-1.5 shrink-0 rounded-full ' + (mon.ollamaUp ? 'bg-emerald-400' : 'bg-red-400')
                }
              />
              {mon.ollamaUp ? 'Running' : 'Offline'}
            </p>
            {mon.ollamaUp && mon.ollamaVersion && (
              <p className="text-[10px] tabular-nums text-muted">v{mon.ollamaVersion}</p>
            )}
          </Card>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line px-4 py-2.5">
        <p className="text-[11px] tabular-nums text-muted">
          {mon.lastUpdated ? `Last updated: ${new Date(mon.lastUpdated).toLocaleTimeString()}` : 'Waiting for data…'}
        </p>
        <button
          onClick={mon.refresh}
          aria-label="Refresh now"
          className="rounded-lg p-1.5 text-muted transition hover:bg-panel2 hover:text-fg"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  )
}
