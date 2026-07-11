import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * whisper.ts constructs a real `new Worker(new URL(...))`, which vitest's node
 * environment has no implementation for — so a fake Worker is installed as a
 * global and the module is imported fresh per test (it holds a module-level
 * `current` handle that would otherwise leak between cases).
 */
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  terminated = false
  private listeners: ((event: MessageEvent) => void)[] = []

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(): void {
    /* the tests drive responses manually via emit() */
  }

  addEventListener(_type: 'message', fn: (event: MessageEvent) => void): void {
    this.listeners.push(fn)
  }

  removeEventListener(_type: 'message', fn: (event: MessageEvent) => void): void {
    this.listeners = this.listeners.filter((l) => l !== fn)
  }

  terminate(): void {
    this.terminated = true
  }

  /** Deliver a worker->main message to both the onmessage prop and any listeners. */
  emit(data: unknown): void {
    const event = { data } as MessageEvent
    this.onmessage?.(event)
    for (const fn of [...this.listeners]) fn(event)
  }
}

async function importWhisper() {
  vi.resetModules()
  return import('../../src/lib/whisper')
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => vi.unstubAllGlobals())

describe('loadWhisper', () => {
  it('does not cache a failed load — a retry gets a fresh worker', async () => {
    const { loadWhisper } = await importWhisper()

    const first = loadWhisper('onnx-community/whisper-base')
    FakeWorker.instances[0].emit({ type: 'error', message: 'network down' })
    await expect(first).rejects.toThrow('network down')

    // The bug this pins: the rejected `ready` promise used to stay memoized on
    // the cached handle, so every later attempt replayed 'network down' forever
    // and on-device voice was dead until a page reload.
    expect(FakeWorker.instances[0].terminated).toBe(true)

    const second = loadWhisper('onnx-community/whisper-base')
    expect(FakeWorker.instances).toHaveLength(2)
    FakeWorker.instances[1].emit({ type: 'ready' })
    await expect(second).resolves.toBeUndefined()
  })

  it('reuses the worker for a model that is already loaded', async () => {
    const { loadWhisper } = await importWhisper()

    const first = loadWhisper('onnx-community/whisper-base')
    FakeWorker.instances[0].emit({ type: 'ready' })
    await first

    await loadWhisper('onnx-community/whisper-base')
    expect(FakeWorker.instances).toHaveLength(1)
  })

  it('tears down the old worker when the model changes', async () => {
    const { loadWhisper } = await importWhisper()

    const first = loadWhisper('onnx-community/whisper-base')
    FakeWorker.instances[0].emit({ type: 'ready' })
    await first

    const second = loadWhisper('onnx-community/whisper-tiny.en')
    expect(FakeWorker.instances[0].terminated).toBe(true)
    FakeWorker.instances[1].emit({ type: 'ready' })
    await second
  })

  it('reports download progress', async () => {
    const { loadWhisper } = await importWhisper()
    const pcts: number[] = []

    const load = loadWhisper('onnx-community/whisper-base', (pct) => pcts.push(pct))
    FakeWorker.instances[0].emit({ type: 'progress', pct: 40 })
    FakeWorker.instances[0].emit({ type: 'progress', pct: 90 })
    FakeWorker.instances[0].emit({ type: 'ready' })
    await load

    expect(pcts).toEqual([40, 90])
  })
})

describe('transcribe', () => {
  it('resolves with the worker text', async () => {
    const { loadWhisper, transcribe } = await importWhisper()
    const load = loadWhisper('onnx-community/whisper-base')
    FakeWorker.instances[0].emit({ type: 'ready' })
    await load

    const pending = transcribe(new Float32Array(8))
    FakeWorker.instances[0].emit({ type: 'result', text: 'hello world' })
    await expect(pending).resolves.toBe('hello world')
  })

  // Without this, terminating the worker mid-transcription left the promise
  // hanging forever, wedging the UI in its 'transcribing' state — which
  // disables the mic button, so voice input never recovered.
  it('rejects an in-flight transcription when the worker is disposed', async () => {
    const { loadWhisper, transcribe, disposeWhisper } = await importWhisper()
    const load = loadWhisper('onnx-community/whisper-base')
    FakeWorker.instances[0].emit({ type: 'ready' })
    await load

    const pending = transcribe(new Float32Array(8))
    disposeWhisper()
    await expect(pending).rejects.toThrow('cancelled')
  })

  it('throws when no model is loaded', async () => {
    const { transcribe } = await importWhisper()
    await expect(transcribe(new Float32Array(8))).rejects.toThrow('not loaded')
  })
})
