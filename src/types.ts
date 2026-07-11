import type { MessageStat } from './lib/stats'

export type Role = 'user' | 'assistant'

/** A retrieved source excerpt cited under a RAG-grounded assistant reply. */
export type ChatSource = {
  n: number
  fileName: string
  snippet: string
}

export type ChatMessage = {
  id: string
  role: Role
  content: string
  stat?: MessageStat
  sources?: ChatSource[]
}

export type OllamaModel = {
  name: string
  model?: string
  modified_at?: string
  size?: number
  digest?: string
  details?: {
    format?: string
    family?: string
    families?: string[]
    parameter_size?: string
    quantization_level?: string
  }
}

/**
 * checking  - probing Ollama on load / refresh
 * online    - Ollama reachable and at least one model installed
 * no-models - Ollama reachable but no models pulled yet
 * offline   - Ollama not reachable (not running / not installed)
 */
export type OllamaStatus = 'checking' | 'online' | 'no-models' | 'offline'

export type Effort = 'fast' | 'balanced' | 'deep' | 'ultrathink'
