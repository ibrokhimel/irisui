/**
 * Runs Whisper inference off the main thread — transformers.js pulls in a
 * multi-megabyte WASM/ONNX runtime and can block for seconds during model
 * load and transcription, which would freeze the UI if run inline.
 *
 * This file only ever runs inside the dedicated Worker constructed by
 * lib/whisper.ts (Vite's `new Worker(new URL(...), { type: 'module' })`
 * idiom). The app's tsconfig only loads the DOM lib (needed everywhere else),
 * and DOM + WebWorker declare incompatible globals for `self` — so rather
 * than pull in the WebWorker lib for this one file (breaking every other
 * file's typecheck), `self` is narrowed locally to just the members used.
 */
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

export type WorkerInMessage = { type: 'load'; modelId: string } | { type: 'transcribe'; audio: Float32Array }

export type WorkerOutMessage =
  | { type: 'progress'; pct: number }
  | { type: 'ready' }
  | { type: 'result'; text: string }
  | { type: 'error'; message: string }

const ctx = self as unknown as {
  postMessage: (message: WorkerOutMessage) => void
  onmessage: ((event: MessageEvent<WorkerInMessage>) => void) | null
}

let transcriber: AutomaticSpeechRecognitionPipeline | null = null

function post(message: WorkerOutMessage): void {
  ctx.postMessage(message)
}

async function load(modelId: string): Promise<void> {
  // 'progress_total' aggregates bytes loaded across every file the model
  // needs, so the percentage climbs monotonically. Per-file 'progress'
  // events would instead reset to 0 each time a new file starts downloading.
  const onProgress = (info: { status: string; progress?: number }) => {
    if (info.status === 'progress_total' && typeof info.progress === 'number') {
      post({ type: 'progress', pct: Math.round(info.progress) })
    }
  }

  // dtype MUST be pinned, for two reasons:
  //
  // 1. Size. Left unset, transformers.js picks fp32 on webgpu — whisper-base in
  //    fp32 is ~290 MB, against ~80 MB quantized. The sizes quoted in Settings
  //    (asrModels.ts) are the quantized ones, so an unpinned dtype silently
  //    downloads several times what the UI promised.
  // 2. The fallback below would otherwise re-download. wasm defaults to q8 while
  //    webgpu defaults to fp32, so a failed webgpu init followed by the wasm
  //    retry would fetch a *different set of files* — paying for the model twice.
  //
  // Pinning q8 for both keeps the download small and makes the retry a cache hit.
  const options = { dtype: 'q8', progress_callback: onProgress } as const

  try {
    transcriber = await pipeline('automatic-speech-recognition', modelId, {
      ...options,
      device: 'webgpu',
    })
  } catch {
    // No WebGPU adapter, or its init threw — wasm runs everywhere (CPU),
    // just slower, so it's the universal fallback rather than a hard error.
    // Same dtype, so the weights already fetched above are reused, not refetched.
    transcriber = await pipeline('automatic-speech-recognition', modelId, {
      ...options,
      device: 'wasm',
    })
  }
  post({ type: 'ready' })
}

async function transcribe(audio: Float32Array): Promise<void> {
  if (!transcriber) {
    post({ type: 'error', message: 'Whisper model is not loaded yet.' })
    return
  }
  // Whisper is BATCH-only here: no streaming/interim output, so the caller
  // just awaits one final result. chunk_length_s lets it handle recordings
  // longer than the model's 30s attention window.
  const output = await transcriber(audio, { chunk_length_s: 30 })
  post({ type: 'result', text: (output.text ?? '').trim() })
}

ctx.onmessage = (event) => {
  const msg = event.data
  const run = msg.type === 'load' ? load(msg.modelId) : transcribe(msg.audio)
  run.catch((err: unknown) => {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  })
}
