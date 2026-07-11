/**
 * A model ref qualifies a model with the provider that serves it:
 * `ollama:qwen2.5:0.5b`, `openai:gpt-4o-mini`. Two providers can serve the same
 * model name, so a bare name is ambiguous once more than one provider exists.
 */
export type ProviderId = 'ollama' | 'openai' | 'anthropic'

export const PROVIDER_IDS: readonly ProviderId[] = ['ollama', 'openai', 'anthropic']

function isProviderId(v: string): v is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(v)
}

/**
 * Split on the FIRST colon only — Ollama model names contain colons of their own
 * ("qwen2.5:0.5b"), so a naive split(':') mangles them.
 *
 * A ref with no recognized provider prefix is Ollama: every value persisted
 * before this change is a bare Ollama name, so they stay valid without a
 * migration pass.
 */
export function parseModelRef(ref: string): { providerId: ProviderId; id: string } {
  const colon = ref.indexOf(':')
  if (colon > 0) {
    const head = ref.slice(0, colon)
    if (isProviderId(head)) return { providerId: head, id: ref.slice(colon + 1) }
  }
  return { providerId: 'ollama', id: ref }
}

export function formatModelRef(providerId: ProviderId, id: string): string {
  return `${providerId}:${id}`
}
