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

/** Loads (or reuses) the worker for `modelId`. Switching models tears down the old worker. */
export async function loadWhisper(
  modelId: string = DEFAULT_ASR_MODEL,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (current?.modelId === modelId) {
    await current.ready
    return
  }
  disposeWhisper()
  current = createWorkerHandle(modelId, onProgress)
  await current.ready
}

export async function transcribe(audio: Float32Array): Promise<string> {
  if (!current) throw new Error('Whisper model is not loaded. Call loadWhisper() first.')
  const worker = current.worker
  return new Promise<string>((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data
      if (msg.type === 'result') {
        worker.removeEventListener('message', onMessage)
        resolve(msg.text)
      } else if (msg.type === 'error') {
        worker.removeEventListener('message', onMessage)
        reject(new Error(msg.message))
      }
      // 'progress'/'ready' can't occur here — those only fire during 'load'.
    }
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
}
