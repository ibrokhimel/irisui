import { DEFAULT_ASR_MODEL } from './appSettings'
import type { WorkerInMessage, WorkerOutMessage } from '../workers/whisper.worker'

/**
 * Main-thread client for the Whisper worker. `@huggingface/transformers` is
 * only ever pulled in by the worker bundle, constructed lazily below — most
 * sessions never touch local transcription, so it must not sit in the main
 * chunk. The `import type` above is erased at compile time and carries no
 * runtime cost.
 */

interface WhisperWorkerHandle {
  modelId: string
  worker: Worker
  ready: Promise<void>
}

let current: WhisperWorkerHandle | null = null

export function isWhisperSupported(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof WebAssembly !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

function createWorkerHandle(modelId: string, onProgress?: (pct: number) => void): WhisperWorkerHandle {
  const worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
    type: 'module',
  })

  const ready = new Promise<void>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        onProgress?.(msg.pct)
        return
      }
      // 'ready'/'error' only ever fire once per load — detach so a later
      // transcribe()'s messages don't get (harmlessly) re-checked here too.
      worker.onmessage = null
      if (msg.type === 'ready') resolve()
      else if (msg.type === 'error') reject(new Error(msg.message))
    }
    worker.onerror = (event) => reject(new Error(event.message || 'Whisper worker failed to start.'))
  })

  worker.postMessage({ type: 'load', modelId } satisfies WorkerInMessage)
  return { modelId, worker, ready }
}

/**
 * Loads (or reuses) the worker for `modelId`. Switching models tears down the
 * old worker.
 *
 * A FAILED load must never be cached. The `ready` promise is memoized on the
 * handle, so keeping a rejected one around would make every subsequent attempt
 * replay the original error forever — bricking on-device voice for the life of
 * the page after a single transient hiccup (offline, HF blip), which is exactly
 * the situation the local engine exists to rescue. On rejection we tear the
 * handle down so the next click gets a genuinely fresh attempt.
 */
export async function loadWhisper(
  modelId: string = DEFAULT_ASR_MODEL,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (current?.modelId === modelId) {
    try {
      await current.ready
      return
    } catch (err) {
      disposeWhisper()
      throw err
    }
  }
  disposeWhisper()
  const handle = createWorkerHandle(modelId, onProgress)
  current = handle
  try {
    await handle.ready
  } catch (err) {
    // Only dispose if nothing else has replaced this handle in the meantime.
    if (current === handle) disposeWhisper()
    throw err
  }
}

/** Rejectors for in-flight transcriptions, so disposeWhisper can settle them. */
let pendingTranscriptions = new Set<(err: Error) => void>()

export async function transcribe(audio: Float32Array): Promise<string> {
  if (!current) throw new Error('Whisper model is not loaded. Call loadWhisper() first.')
  const worker = current.worker
  return new Promise<string>((resolve, reject) => {
    const settle = (fn: () => void) => {
      worker.removeEventListener('message', onMessage)
      pendingTranscriptions.delete(reject)
      fn()
    }
    const onMessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data
      if (msg.type === 'result') settle(() => resolve(msg.text))
      else if (msg.type === 'error') settle(() => reject(new Error(msg.message)))
      // 'progress'/'ready' can't occur here — those only fire during 'load'.
    }
    // A terminated worker can never post back, so without this the promise
    // would hang forever and leave the UI stuck in its 'transcribing' state
    // (which disables the mic button — an unrecoverable wedge).
    pendingTranscriptions.add(reject)
    worker.addEventListener('message', onMessage)
    // Transfer the buffer instead of structured-cloning it — recordings can
    // be several MB of Float32 samples, and the caller has no further use
    // for `audio` after handing it off for transcription.
    worker.postMessage({ type: 'transcribe', audio } satisfies WorkerInMessage, [audio.buffer])
  })
}

export function disposeWhisper(): void {
  if (!current) return
  current.worker.terminate()
  current = null
  const rejectors = pendingTranscriptions
  pendingTranscriptions = new Set()
  for (const reject of rejectors) reject(new Error('Transcription was cancelled.'))
}
