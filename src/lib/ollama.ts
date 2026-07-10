import type { OllamaModel } from '../types'

/**
 * In dev we go through the Vite proxy (`/ollama` -> http://localhost:11434),
 * which makes every request same-origin and sidesteps CORS entirely. A future
 * production build would talk to Ollama directly.
 */
const OLLAMA_BASE = import.meta.env.DEV ? '/ollama' : 'http://localhost:11434'

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
 * A malformed line is skipped rather than allowed to crash the stream.
 */
export async function streamChat(params: StreamChatParams): Promise<void> {
  const { model, messages, temperature, signal, onToken } = params

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true, messages, options: { temperature } }),
    signal,
  })

  if (!res.ok) throw new Error(`Ollama responded with ${res.status}`)
  if (!res.body) throw new Error('Streaming is not supported in this environment')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        emit(line, onToken)
      }
    }
    // Flush any trailing partial line.
    emit(buffer, onToken)
  } finally {
    reader.releaseLock()
  }
}

function emit(line: string, onToken: (chunk: string) => void): void {
  const trimmed = line.trim()
  if (!trimmed) return
  try {
    const json = JSON.parse(trimmed) as { message?: { content?: unknown } }
    const content = json.message?.content
    if (typeof content === 'string' && content) onToken(content)
  } catch {
    // Ignore malformed chunks — never let a bad line break the UI.
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}
