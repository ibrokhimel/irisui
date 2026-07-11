import type { ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { AlertTriangle, Loader2, Plus, Scissors, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatTokens } from '../lib/context'

const BANNER_TONE = {
  amber: { box: 'border-amber-500/30 bg-amber-500/10 text-amber-200/90', icon: 'text-amber-400' },
  rose: { box: 'border-rose-500/30 bg-rose-500/10 text-rose-200/90', icon: 'text-rose-400' },
  muted: { box: 'border-line bg-panel2/60 text-muted', icon: 'text-iris' },
}

/** Shared shell for the composer's dismissible/status banners (RAG notice, voice error, voice progress). */
export function Banner({
  show, tone, icon: Icon, iconClassName, onDismiss, dismissLabel, children,
}: {
  show: boolean
  tone: keyof typeof BANNER_TONE
  icon: LucideIcon
  iconClassName?: string
  onDismiss?: () => void
  dismissLabel?: string
  children: ReactNode
}) {
  const { box, icon } = BANNER_TONE[tone]
  return (
    <AnimatePresence>
      {show && (
        <m.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className={`mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${box}`}
        >
          <Icon className={`h-3.5 w-3.5 shrink-0 ${icon} ${iconClassName ?? ''}`} />
          <span className="flex-1">{children}</span>
          {onDismiss && (
            <button
              onClick={onDismiss}
              aria-label={dismissLabel ?? 'Dismiss'}
              className="shrink-0 rounded p-0.5 opacity-70 transition hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </m.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Shown when the conversation has filled its context window. Sending is blocked
 * at this point — NOT as a nag, but because Ollama's alternative is to silently
 * drop the oldest messages and answer anyway, leaving the user with a model
 * that has quietly forgotten the start of the chat.
 *
 * The summarize action is offered as the way forward, and is labelled lossy
 * because it is: the model condenses the transcript, and condensing loses things.
 */
export function ContextFullNotice({
  show,
  limit,
  summarizing,
  onSummarize,
  onNewChat,
}: {
  show: boolean
  limit: number
  summarizing: boolean
  onSummarize: () => void
  onNewChat: () => void
}) {
  const { box, icon } = BANNER_TONE.rose
  return (
    <AnimatePresence>
      {show && (
        <m.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className={`mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border px-3 py-2 text-xs ${box}`}
        >
          <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${icon}`} />
          <span className="flex-1 min-w-[16rem]">
            <span className="font-medium">
              This chat has filled its {formatTokens(limit)} context window.
            </span>{' '}
            Sending more would make the model silently forget the earliest messages.
          </span>
          <button
            onClick={onSummarize}
            disabled={summarizing}
            title="Condense this conversation and carry it into a new chat. The summary is lossy."
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-400/40 px-2 py-1 font-medium transition hover:bg-rose-500/20 disabled:opacity-60"
          >
            {summarizing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Scissors className="h-3 w-3" />
            )}
            {summarizing ? 'Summarizing…' : 'Summarize & continue'}
          </button>
          <button
            onClick={onNewChat}
            disabled={summarizing}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-400/40 px-2 py-1 font-medium transition hover:bg-rose-500/20 disabled:opacity-60"
          >
            <Plus className="h-3 w-3" />
            New chat
          </button>
        </m.div>
      )}
    </AnimatePresence>
  )
}
