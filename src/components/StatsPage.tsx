import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { m, useReducedMotion } from 'motion/react'
import { Activity, Trash2 } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { GenerationStat } from '../lib/stats'
import { summarizeByModel } from '../lib/stats'
import { clearStats, listStats } from '../lib/statsStore'
import { fadeUp, stagger } from '../lib/motion'
import { useCountUp } from '../hooks/useCountUp'
import { ConfirmDialog } from './ConfirmDialog'

const AXIS = { fill: 'var(--color-muted)', fontSize: 11 }
const TOOLTIP_STYLE = {
  background: 'var(--color-panel)',
  border: '1px solid var(--color-line)',
  borderRadius: 8,
  color: 'var(--color-fg)',
}
const LINE_CURSOR = { stroke: 'var(--color-line)', strokeWidth: 1 }
const BAR_CURSOR = { fill: 'var(--color-line)', opacity: 0.15 }
const ACTIVE_DOT = { r: 4, stroke: 'var(--color-panel)', strokeWidth: 2 }

export function StatsPage() {
  const [stats, setStats] = useState<GenerationStat[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const reduced = useReducedMotion()
  const chartAnim = { isAnimationActive: !reduced, animationDuration: 600 }

  useEffect(() => {
    void listStats().then(setStats).catch(() => setStats([]))
  }, [])

  const summaries = summarizeByModel(stats)
  const fastest = [...summaries].sort((a, b) => b.avgTokensPerSec - a.avgTokensPerSec)[0]
  const timeline = [...stats].reverse().map((s, i) => ({
    n: i + 1,
    tps: Number(s.tokensPerSec.toFixed(1)),
    totalS: Number((s.totalMs / 1000).toFixed(1)),
  }))

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-fg">
            <Activity className="h-6 w-6 text-iris" />
            Stats
          </h1>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={stats.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:border-rose-500/40 hover:text-rose-200 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
            Clear history
          </button>
        </div>

        {stats.length === 0 ? (
          <div className="rounded-xl border border-line bg-panel/40 px-4 py-10 text-center text-sm text-muted">
            No generations recorded yet. Chat with a model and stats will appear here.
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card index={0} label="Generations" value={<CountUpValue target={stats.length} />} />
              <Card index={1} label="Most used" value={summaries[0]?.model ?? '—'} />
              <Card index={2} label="Fastest" value={fastest ? `${fastest.model} · ${fastest.avgTokensPerSec.toFixed(1)} tok/s` : '—'} />
            </div>

            <ChartPanel index={0} title="Tokens/sec over time">
              <LineChart data={timeline}>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
                <XAxis dataKey="n" tick={AXIS} stroke="var(--color-line)" />
                <YAxis tick={AXIS} stroke="var(--color-line)" width={36} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={LINE_CURSOR} />
                <Line
                  type="monotone"
                  dataKey="tps"
                  stroke="var(--color-iris)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ ...ACTIVE_DOT, fill: 'var(--color-iris)' }}
                  {...chartAnim}
                />
              </LineChart>
            </ChartPanel>

            <ChartPanel index={1} title="Average speed per model (tok/s)">
              <BarChart data={summaries.map((s) => ({ model: s.model.slice(0, 18), avg: Number(s.avgTokensPerSec.toFixed(1)) }))}>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
                <XAxis dataKey="model" tick={AXIS} stroke="var(--color-line)" />
                <YAxis tick={AXIS} stroke="var(--color-line)" width={36} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR} />
                <Bar dataKey="avg" fill="var(--color-iris)" radius={[6, 6, 0, 0]} {...chartAnim} />
              </BarChart>
            </ChartPanel>

            <ChartPanel index={2} title="Response time (s)">
              <LineChart data={timeline}>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
                <XAxis dataKey="n" tick={AXIS} stroke="var(--color-line)" />
                <YAxis tick={AXIS} stroke="var(--color-line)" width={36} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={LINE_CURSOR} />
                <Line
                  type="monotone"
                  dataKey="totalS"
                  stroke="var(--color-iris-strong)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ ...ACTIVE_DOT, fill: 'var(--color-iris-strong)' }}
                  {...chartAnim}
                />
              </LineChart>
            </ChartPanel>

            {/* Recent generations */}
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-fg">Recent generations</h2>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-panel2 text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 font-medium">tok/s</th>
                      <th className="px-3 py-2 font-medium">First token</th>
                      <th className="px-3 py-2 font-medium">Total</th>
                      <th className="px-3 py-2 font-medium">Tokens</th>
                      <th className="px-3 py-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.slice(0, 12).map((s) => (
                      <tr key={s.id} className="border-t border-line text-fg/90">
                        <td className="max-w-[180px] truncate px-3 py-2">{s.model}</td>
                        <td className="px-3 py-2">{s.tokensPerSec.toFixed(1)}</td>
                        <td className="px-3 py-2">{s.ttftMs}ms</td>
                        <td className="px-3 py-2">{(s.totalMs / 1000).toFixed(1)}s</td>
                        <td className="px-3 py-2">{s.completionTokens}</td>
                        <td className="px-3 py-2 text-muted">{new Date(s.startedAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        danger
        title="Clear stats history?"
        message="This removes all recorded generation stats. Chats are not affected."
        confirmLabel="Clear"
        onConfirm={() => {
          void clearStats().then(() => setStats([]))
          setConfirmOpen(false)
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

function CountUpValue({ target }: { target: number }) {
  return <>{useCountUp(target)}</>
}

function Card({ index, label, value }: { index: number; label: string; value: ReactNode }) {
  return (
    <m.div
      className="rounded-xl border border-line bg-panel/50 px-4 py-3"
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={stagger(index)}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-fg">{value}</p>
    </m.div>
  )
}

function ChartPanel({ index, title, children }: { index: number; title: string; children: ReactElement }) {
  return (
    <m.section
      className="mb-4 rounded-xl border border-line bg-panel/40 p-4"
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={stagger(index, 0.12)}
    >
      <h2 className="mb-3 text-sm font-semibold text-fg">{title}</h2>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </m.section>
  )
}
