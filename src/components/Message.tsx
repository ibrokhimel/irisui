import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Check, Copy, RefreshCw, StepForward } from 'lucide-react'
import type { ChatMessage, ChatSource } from '../types'
import { SPRING, fadeUp } from '../lib/motion'
import { Markdown } from './Markdown'
import { IrisMark } from './IrisMark'
import { formatStatLine } from '../lib/stats'

export function Message({
  message,
  streaming,
  isLast,
  onRegenerate,
  onContinue,
}: {
  message: ChatMessage
  streaming: boolean
  isLast: boolean
  onRegenerate?: () => void
  onContinue?: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  if (message.role === 'user') {
    return (
      <m.div
        className="flex justify-end"
        variants={fadeUp}
        initial="hidden"
        animate="show"
        transition={SPRING}
      >
        <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm border border-line bg-panel2 px-4 py-2.5 text-[15px] leading-relaxed text-fg">
          {message.content}
        </div>
      </m.div>
    )
  }

  return (
    <m.div
      className="group flex gap-3"
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={SPRING}
    >
      <div
        className={
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-panel2 ' +
          (streaming ? 'border-iris ring-2 ring-iris/20' : 'border-line')
        }
      >
        {/* The aperture turns while the model generates. */}
        <IrisMark className={'h-[18px] w-[18px] text-iris' + (streaming ? ' anim-aperture' : '')} />
      </div>
      <div className="min-w-0 flex-1 pt-1">
        {message.content && <Markdown content={message.content} />}
        {streaming && <span className="stream-caret align-middle" aria-hidden="true" />}

        {!streaming && message.stat && (
          <p className="mt-1.5 font-mono text-[11px] text-muted/70">{formatStatLine(message.stat)}</p>
        )}

        {!streaming && message.sources && message.sources.length > 0 && (
          <Sources sources={message.sources} />
        )}

        {!streaming && message.content && (
          <div className="mt-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={copy}
              aria-label="Copy message"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition hover:bg-panel2 hover:text-fg"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {isLast && onRegenerate && (
              <button
                onClick={onRegenerate}
                aria-label="Regenerate response"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition hover:bg-panel2 hover:text-fg"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            )}
            {isLast && onContinue && (
              <button
                onClick={onContinue}
                aria-label="Continue response"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition hover:bg-panel2 hover:text-fg"
              >
                <StepForward className="h-3.5 w-3.5" />
                Continue
              </button>
            )}
          </div>
        )}
      </div>
    </m.div>
  )
}

/** Numbered citation chips under a RAG-grounded reply; a chip expands its
 *  source snippet (height animation, mirroring ModelRow's details drawer). */
function Sources({ sources }: { sources: ChatSource[] }) {
  const [openN, setOpenN] = useState<number | null>(null)
  const open = sources.find((s) => s.n === openN)

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted/70">Sources</span>
        {sources.map((s) => {
          const active = s.n === openN
          return (
            <button
              key={s.n}
              onClick={() => setOpenN(active ? null : s.n)}
              aria-expanded={active}
              className={
                'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition ' +
                (active
                  ? 'border-iris bg-iris/10 text-iris'
                  : 'border-line text-muted hover:border-iris/40 hover:text-fg')
              }
            >
              <span className="font-mono">[{s.n}]</span>
              <span className="max-w-[140px] truncate">{s.fileName}</span>
            </button>
          )
        })}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key={open.n}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <p className="mt-2 rounded-lg border border-line bg-panel2/50 px-3 py-2 text-xs leading-relaxed text-muted">
              <span className="font-mono text-muted/70">[{open.n}]</span> {open.snippet}
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
