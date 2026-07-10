import type { OllamaModel } from '../types'

/**
 * In dev we go through the Vite proxy (`/ollama` -> http://localhost:11434),
 * which makes every request same-origin and sidesteps CORS entirely. A future
 * production build would talk to Ollama directly.
 */
const OLLAMA_BASE = import.meta.env.DEV ? '/ollama' : 'http://localhost:11434'
const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** GET /api/tags — list installed models. Throws if Ollama is unreachable. */
export async function fetchModels(signal?: AbortSignal): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal })
  if (!res.ok) throw new Error(`Ollama responded with ${res.status}`)
  const data: unknown = await res.json()
  const models = (data as { models?: unknown })?.models
  if (!Array.isArray(models)) return []
  return models as OllamaModel[]
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
 */
export async function streamChat(params: StreamChatParams): Promise<void> {
  const { model, messages, temperature, signal, onToken } = params

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ model, stream: true, messages, options: { temperature } }),
    signal,
  })

  if (!res.ok) throw new Error(`Ollama responded with ${res.status}`)
  if (!res.body) throw new Error('Streaming is not supported in this environment')

  await readJsonStream(res.body, (obj) => {
    const message = obj.message as { content?: unknown } | undefined
    const content = message?.content
    if (typeof content === 'string' && content) onToken(content)
  })
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
  const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, model: name, stream: true }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`Pull failed (${res.status})`)

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
  const res = await fetch(`${OLLAMA_BASE}/api/delete`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, model: name }),
  })
  if (!res.ok) throw new Error(`Delete failed (${res.status})`)
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
  const res = await fetch(`${OLLAMA_BASE}/api/show`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, model: name }),
  })
  if (!res.ok) throw new Error(`Show failed (${res.status})`)
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

  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
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
  if (!res.ok || !res.body) throw new Error(`Benchmark failed (${res.status})`)

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

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}
