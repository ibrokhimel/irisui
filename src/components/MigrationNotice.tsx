import { useEffect } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Download } from 'lucide-react'
import { SPRING } from '../lib/motion'

/**
 * One-time first-run notice on the desktop app. The install is a fresh origin,
 * so nothing from the web version is here — this points the user at the backup
 * importer in Settings → Data before they wonder where their chats went.
 */
export function MigrationNotice({
  open,
  onImport,
  onDismiss,
}: {
  open: boolean
  onImport: () => void
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="migration-notice"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to IRIS for desktop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label="Dismiss notice"
            onClick={onDismiss}
          />
          <m.div
            className="relative w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={SPRING}
          >
            <div className="mb-2 flex items-center gap-2">
              <Download className="h-5 w-5 shrink-0 text-iris" />
              <h2 className="text-base font-semibold text-fg">Welcome to IRIS for desktop</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              This is a fresh install, so chats, knowledge bases and settings from the browser
              version aren’t here yet. If you exported a backup from the web app, you can import it
              now — otherwise just start fresh.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onDismiss}
                className="rounded-lg border border-line px-3.5 py-2 text-sm text-fg transition hover:bg-panel2 active:scale-[0.97]"
              >
                Start fresh
              </button>
              <button
                onClick={onImport}
                className="btn-primary rounded-lg px-3.5 py-2 text-sm font-medium text-white transition active:scale-[0.97]"
              >
                Import my data
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
