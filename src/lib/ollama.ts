import type { OllamaModel } from '../types'
import { loadAppSettings } from './appSettings'

/**
 * Base URL for every Ollama request. A custom host configured in Settings
 * always wins — even in dev — so pointing at a remote/LAN Ollama instance
 * bypasses the dev proxy entirely (the caller is on their own for CORS via
 * OLLAMA_ORIGINS). Otherwise dev goes through the Vite proxy (`/ollama` ->
 * http://localhost:11434), which makes every request same-origin and
 * sidesteps CORS entirely; a production build without a custom host talks to
 * the default local port directly. Read fresh on every call (not cached at
 * import time) so a Settings change takes effect immediately.
 */
export function getOllamaBase(): string {
  const custom = loadAppSettings().ollamaUrl.trim()
  if (custom) return custom.replace(/\/+$/, '')
  return import.meta.env.DEV ? '/ollama' : 'http://localhost:11434'
}
const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** GET /api/tags — list installed models. Throws if Ollama is unreachable. */
export async function fetchModels(signal?: AbortSignal): Promise<OllamaModel[]> {
  const res = await fetch(`${getOllamaBase()}/api/tags`, { signal })
  if (!res.ok) throw new Error(`Ollama responded with ${res.status}`)
  const data: unknown = await res.json()
  const models = (data as { models?: unknown })?.models
  if (!Array.isArray(models)) return []
  return models as OllamaModel[]
}

export interface ChatStreamResult {
  promptTokens: number      // prompt_eval_count from the done chunk (0 if absent)
  completionTokens: number  // eval_count
  evalDurationNs: number    // eval_duration
  totalDurationNs: number   // total_duration
  loadDurationNs: number    // load_duration
}

export interface StreamChatParams {
  model: string
  messages: { role: string; content: string }[]
  temperature: number
  signal: AbortSignal
  onToken: (chunk: string) => void
}

/**
 * POST /api/chat with stream:true. Ollama returns newline-delimited JSON; we
 * parse each line defensively and forward `message.content` deltas via onToken.
 * Returns metadata from the done chunk.
 */
export async function streamChat(params: StreamChatParams): Promise<ChatStreamResult> {
  const { model, messages, temperature, signal, onToken } = params

  const res = await fetch(`${getOllamaBase()}/api/chat`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ model, stream: true, messages, options: { temperature } }),
    signal,
  })

  if (!res.ok) throw new Error(await readError(res))
  if (!res.body) throw new Error('Streaming is not supported in this environment')

  const result: ChatStreamResult = {
    promptTokens: 0, completionTokens: 0,
    evalDurationNs: 0, totalDurationNs: 0, loadDurationNs: 0,
  }
  const num = (v: unknown) => (typeof v === 'number' ? v : 0)
  await readJsonStream(res.body, (obj) => {
    const message = obj.message as { content?: unknown } | undefined
    const content = message?.content
    if (typeof content === 'string' && content) onToken(content)
    if (obj.done) {
      result.promptTokens = num(obj.prompt_eval_count)
      result.completionTokens = num(obj.eval_count)
      result.evalDurationNs = num(obj.eval_duration)
      result.totalDurationNs = num(obj.total_duration)
      result.loadDurationNs = num(obj.load_duration)
    }
  })
  return result
}

// ── Model management ─────────────────────────────────────────────────────

export interface PullProgress {
  status: string
  completed?: number
  total?: number
}

/** POST /api/pull (streamed) — download/install a model, reporting progress. */
export async function pullModel(opts: {
  name: string
  signal: AbortSignal
  onProgress: (p: PullProgress) => void
}): Promise<void> {
  const { name, signal, onProgress } = opts
  const res = await fetch(`${getOllamaBase()}/api/pull`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, model: name, stream: true }),
    signal,
  })
  if (!res.ok) throw new Error(await readError(res))
  if (!res.body) throw new Error('Pull failed: no response body')

  await readJsonStream(res.body, (obj) => {
    if (typeof obj.error === 'string') throw new Error(obj.error)
    onProgress({
      status: typeof obj.status === 'string' ? obj.status : '',
      completed: typeof obj.completed === 'number' ? obj.completed : undefined,
      total: typeof obj.total === 'number' ? obj.total : undefined,
    })
  })
}

/** DELETE /api/delete — remove a model from disk. */
export async function deleteModel(name: string): Promise<void> {
  const res = await fetch(`${getOllamaBase()}/api/delete`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, model: name }),
  })
  if (!res.ok) throw new Error(await readError(res))
}

export interface ModelDetails {
  parameters?: string
  template?: string
  license?: string
  details?: Record<string, unknown>
  model_info?: Record<string, unknown>
}

/** POST /api/show — full metadata for one model. */
export async function showModel(name: string): Promise<ModelDetails> {
  const res = await fetch(`${getOllamaBase()}/api/show`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, model: name }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as ModelDetails
}

export interface BenchmarkResult {
  tokensPerSec: number
  ttftMs: number
  evalCount: number
}

/**
 * Measure real generation speed: runs a short prompt and derives tokens/sec
 * from Ollama's own eval_count / eval_duration (nanoseconds). No fabrication.
 */
export async function benchmarkModel(opts: {
  name: string
  signal: AbortSignal
}): Promise<BenchmarkResult> {
  const { name, signal } = opts
  const start = performance.now()
  let firstAt = 0
  let evalCount = 0
  let evalDuration = 0

  const res = await fetch(`${getOllamaBase()}/api/generate`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      model: name,
      prompt: 'Write a short paragraph about the ocean.',
      stream: true,
      options: { num_predict: 120 },
    }),
    signal,
  })
  if (!res.ok) throw new Error(await readError(res))
  if (!res.body) throw new Error('Benchmark failed: no response body')

  await readJsonStream(res.body, (obj) => {
    if (typeof obj.error === 'string') throw new Error(obj.error)
    if (!firstAt && typeof obj.response === 'string' && obj.response.length) {
      firstAt = performance.now()
    }
    if (obj.done) {
      if (typeof obj.eval_count === 'number') evalCount = obj.eval_count
      if (typeof obj.eval_duration === 'number') evalDuration = obj.eval_duration
    }
  })

  return {
    tokensPerSec: evalDuration > 0 ? evalCount / (evalDuration / 1e9) : 0,
    ttftMs: firstAt > 0 ? firstAt - start : 0,
    evalCount,
  }
}

// ── Embeddings ────────────────────────────────────────────────────────────

/**
 * POST /api/embed — batch-embed `texts` with `model`. Validates the response
 * shape defensively: a missing/mis-sized/ragged/non-numeric `embeddings`
 * array throws rather than silently returning garbage vectors.
 */
export async function embedTexts(model: string, texts: string[]): Promise<number[][]> {
  const res = await fetch(`${getOllamaBase()}/api/embed`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ model, input: texts }),
  })
  if (!res.ok) throw new Error(await readError(res))

  const data: unknown = await res.json()
  const embeddings = (data as { embeddings?: unknown } | null)?.embeddings

  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    throw new Error('Embedding failed: unexpected response')
  }

  const dim = embeddings.length > 0 ? (embeddings[0] as unknown[])?.length : undefined
  const valid = embeddings.every(
    (vec): vec is number[] =>
      Array.isArray(vec) &&
      vec.length > 0 &&
      vec.length === dim &&
      vec.every((n) => Number.isFinite(n)),
  )
  if (!valid) throw new Error('Embedding failed: unexpected response')

  return embeddings as number[][]
}

// ── shared NDJSON reader ─────────────────────────────────────────────────

/**
 * Read a newline-delimited JSON stream, invoking `onObject` per line. Malformed
 * lines are skipped; an error thrown by `onObject` (e.g. an Ollama error line)
 * propagates to the caller.
 */
async function readJsonStream(
  body: ReadableStream<Uint8Array>,
  onObject: (obj: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue
        let obj: Record<string, unknown>
        try {
          obj = JSON.parse(line)
        } catch {
          continue
        }
        onObject(obj)
      }
    }
    const last = buffer.trim()
    if (last) {
      try {
        onObject(JSON.parse(last))
      } catch {
        /* ignore trailing partial */
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** Extract a useful message from a non-OK Ollama response (its JSON `error`). */
async function readError(res: Response): Promise<string> {
  let detail = ''
  try {
    const text = await res.text()
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: unknown }
        if (typeof parsed.error === 'string') detail = parsed.error
      } catch {
        detail = text.slice(0, 200)
      }
    }
  } catch {
    /* ignore body read failures */
  }
  return detail || `Ollama responded with ${res.status}`
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}
