import { useEffect } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { AlertTriangle } from 'lucide-react'
import { SPRING } from '../lib/motion'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="confirm-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label="Dismiss dialog"
            onClick={onCancel}
          />
          <m.div
            className="relative w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={SPRING}
          >
            <div className="mb-2 flex items-center gap-2">
              {danger && <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />}
              <h2 className="text-base font-semibold text-fg">{title}</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted">{message}</p>
            {error && <p className="mt-3 text-sm text-rose-300">⚠️ {error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onCancel}
                disabled={busy}
                className="rounded-lg border border-line px-3.5 py-2 text-sm text-fg transition hover:bg-panel2 active:scale-[0.97] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={busy}
                className={
                  'rounded-lg px-3.5 py-2 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-60 ' +
                  (danger ? 'bg-rose-600 hover:bg-rose-500' : 'btn-primary')
                }
              >
                {busy ? 'Working…' : confirmLabel}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
