import { useSyncExternalStore } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { getWhisperLoad, subscribeWhisperLoad } from '../lib/whisper'
import { findAsrModel } from '../lib/asrModels'
import { SPRING } from '../lib/motion'

/**
 * A voice-model download is the one long-running background job in the app: a
 * cold cache can take minutes. It used to be rendered by the composer, which
 * unmounts the moment you open Models or Settings — so switching page made the
 * progress bar vanish and the download look dead, even though it was still
 * running. This lives at the app root and reads the module-level store in
 * lib/whisper, so it survives navigation and follows the download wherever
 * the user goes.
 */
export function WhisperDownload() {
  const load = useSyncExternalStore(subscribeWhisperLoad, getWhisperLoad)
  const downloading = load.status === 'downloading'
  const model = findAsrModel(load.modelId)

  return (
    <AnimatePresence>
      {downloading && (
        <m.div
          key="whisper-download"
          className="fixed bottom-4 left-4 z-40 w-64 rounded-xl border border-line bg-panel/95 p-3 shadow-lg backdrop-blur"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={SPRING}
        >
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-iris" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
              {model.label}
            </span>
            <span className="text-xs tabular-nums text-muted">{load.pct}%</span>
          </div>

          <div className="mt-2 h-1 overflow-hidden rounded-full bg-panel2">
            <m.div
              className="h-full rounded-full bg-iris"
              initial={false}
              animate={{ width: `${load.pct}%` }}
              transition={{ duration: 0.25 }}
            />
          </div>

          <p className="mt-1.5 text-[11px] leading-snug text-muted">
            Downloading the voice model (~{model.sizeMb} MB). Keep using the app — this runs in the
            background.
          </p>
        </m.div>
      )}
    </AnimatePresence>
  )
}
