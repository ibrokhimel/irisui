import { AlertTriangle, Crown, Loader2 } from 'lucide-react'
import { m } from 'motion/react'
import { TAP, fadeUp, stagger } from '../lib/motion'
import { formatStatLine } from '../lib/stats'
import { Markdown } from './Markdown'
import type { ArenaColumn as ArenaColumnState } from '../hooks/useArena'

export function ArenaColumn({
  index,
  column,
  isWinner,
  showWinnerButton,
  onPickWinner,
}: {
  index: number
  column: ArenaColumnState
  isWinner: boolean
  showWinnerButton: boolean
  onPickWinner: () => void
}) {
  const { model, status, content, error, stat } = column
  const streaming = status === 'streaming'

  return (
    <m.div
      className={
        'flex min-h-[280px] flex-col rounded-2xl border bg-panel/40 transition ' +
        (isWinner ? 'border-iris ring-2 ring-iris' : 'border-line')
      }
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={stagger(index)}
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        {streaming && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-iris" />}
        {isWinner && <Crown className="h-3.5 w-3.5 shrink-0 text-iris" />}
        <span className="truncate text-sm font-semibold text-fg">{model}</span>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-3">
        {status === 'error' ? (
          <div className="flex items-start gap-2 text-sm text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span>{error ?? 'This model failed to respond.'}</span>
          </div>
        ) : content ? (
          <>
            <Markdown content={content} />
            {streaming && <span className="stream-caret align-middle" aria-hidden="true" />}
          </>
        ) : streaming ? (
          <p className="text-sm text-muted">Waiting for the first token…</p>
        ) : (
          <p className="text-sm text-muted">—</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
        <p className="truncate font-mono text-[11px] text-muted/70">
          {status === 'done' && stat ? formatStatLine(stat) : ' '}
        </p>
        {showWinnerButton && status === 'done' && (
          <m.button
            onClick={onPickWinner}
            whileTap={TAP}
            aria-pressed={isWinner}
            className={
              'flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ' +
              (isWinner
                ? 'border-iris bg-iris/10 text-iris'
                : 'border-line text-muted hover:border-iris/40 hover:text-fg')
            }
          >
            <Crown className="h-3.5 w-3.5" />
            {isWinner ? 'Best answer' : 'Mark as best'}
          </m.button>
        )}
      </div>
    </m.div>
  )
}
