import { ChevronDown, Minus, Plus, Square, Swords } from 'lucide-react'
import { m } from 'motion/react'
import { TAP } from '../lib/motion'
import { EFFORT_OPTIONS, TEMP_MAX, TEMP_MIN, TEMP_STEP } from '../constants'
import { allColumnsSettled, canRunArena, chatableModels } from '../lib/arena'
import type { OllamaModel, OllamaStatus } from '../types'
import { useArena } from '../hooks/useArena'
import { ArenaColumn } from './ArenaColumn'

export function ArenaPage({ models, status }: { models: OllamaModel[]; status: OllamaStatus }) {
  const arena = useArena(models)
  const options = chatableModels(models)
  const settled = allColumnsSettled(arena.columns.map((c) => c.status))
  const canRun = status === 'online' && canRunArena(arena.prompt, arena.selected, arena.running)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-5 py-6">
        <h1 className="mb-6 flex items-center gap-2 text-2xl font-semibold text-fg">
          <Swords className="h-6 w-6 text-iris" />
          Arena
        </h1>

        <div className="rounded-2xl border border-line bg-panel/40 p-4">
          {/* Model pickers */}
          <div className="flex flex-wrap items-end gap-3">
            {arena.selected.slice(0, arena.modelCount).map((model, i) => (
              <div key={i} className="min-w-[160px] flex-1">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">
                  Model {i + 1}
                </label>
                <div className="relative">
                  <select
                    value={model}
                    onChange={(e) => arena.setModelAt(i, e.target.value)}
                    disabled={arena.running}
                    aria-label={`Model ${i + 1}`}
                    className="w-full appearance-none rounded-lg border border-line bg-panel2 px-3 py-2 pr-8 text-sm text-fg outline-none transition focus:border-iris/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Choose a model…</option>
                    {options.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                </div>
              </div>
            ))}

            {arena.modelCount === 2 ? (
              <button
                onClick={() => arena.setCount(3)}
                disabled={arena.running}
                className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-line px-3 text-xs font-medium text-muted transition hover:border-iris/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add a third model
              </button>
            ) : (
              <button
                onClick={() => arena.setCount(2)}
                disabled={arena.running}
                className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-muted transition hover:border-rose-500/40 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Minus className="h-3.5 w-3.5" />
                Remove third model
              </button>
            )}
          </div>

          {/* Effort + temperature */}
          <div className="mt-4 flex flex-wrap items-end gap-5">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">
                Effort
              </label>
              <div className="relative">
                <select
                  value={arena.effort}
                  onChange={(e) => arena.setEffort(e.target.value as typeof arena.effort)}
                  disabled={arena.running}
                  aria-label="Effort"
                  className="appearance-none rounded-lg border border-line bg-panel2 px-3 py-2 pr-8 text-sm text-fg outline-none transition focus:border-iris/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {EFFORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              </div>
            </div>

            <div className="min-w-[180px] flex-1">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted">
                  Temperature
                </label>
                <span className="font-mono text-xs text-fg">{arena.temperature.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={TEMP_MIN}
                max={TEMP_MAX}
                step={TEMP_STEP}
                value={arena.temperature}
                onChange={(e) => arena.setTemperature(Number(e.target.value))}
                disabled={arena.running}
                aria-label="Temperature"
                className="h-1 w-full cursor-pointer accent-[var(--color-iris)] disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Prompt */}
          <div className="mt-4">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">
              Prompt
            </label>
            <textarea
              value={arena.prompt}
              onChange={(e) => arena.setPrompt(e.target.value)}
              disabled={arena.running}
              rows={3}
              placeholder="Ask every model the same question…"
              className="w-full resize-none rounded-xl border border-line bg-panel2 px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-muted/60 focus:border-iris/50 disabled:cursor-not-allowed disabled:opacity-70"
            />
          </div>

          <div className="mt-3 flex justify-end">
            {arena.running ? (
              <m.button
                onClick={arena.stop}
                whileTap={TAP}
                className="flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-medium text-fg transition hover:border-rose-500/50 hover:text-rose-200"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Stop
              </m.button>
            ) : (
              <m.button
                onClick={() => void arena.run()}
                disabled={!canRun}
                whileTap={canRun ? TAP : undefined}
                className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium shadow-sm"
              >
                <Swords className="h-3.5 w-3.5" />
                Run
              </m.button>
            )}
          </div>
        </div>

        {/* Results */}
        {arena.columns.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-line bg-panel/40 px-5 py-10 text-center">
            <Swords className="mx-auto mb-3 h-8 w-8 text-muted" />
            <p className="text-sm font-medium text-fg">Compare models side by side</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
              Pick 2 or 3 installed models, write one prompt, and run it against all of them at
              once. Each column streams independently, then you can mark the best answer — nothing
              here is saved as a conversation, but the generations still count toward Stats.
            </p>
          </div>
        ) : (
          <div
            className={
              'mt-6 grid grid-cols-1 gap-4 ' +
              (arena.columns.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2')
            }
          >
            {arena.columns.map((column, i) => (
              <ArenaColumn
                key={i}
                index={i}
                column={column}
                isWinner={arena.winner === i}
                showWinnerButton={settled}
                onPickWinner={() => arena.pickWinner(i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
