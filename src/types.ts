export type Role = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  role: Role
  content: string
}

export type OllamaModel = {
  name: string
  model?: string
  modified_at?: string
  size?: number
  digest?: string
}

/**
 * checking  - probing Ollama on load / refresh
 * online    - Ollama reachable and at least one model installed
 * no-models - Ollama reachable but no models pulled yet
 * offline   - Ollama not reachable (not running / not installed)
 */
export type OllamaStatus = 'checking' | 'online' | 'no-models' | 'offline'

export type Effort = 'fast' | 'balanced' | 'deep' | 'ultrathink'
