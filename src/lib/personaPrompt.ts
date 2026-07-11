import type { Conversation } from './store'
import { EFFORT_PROMPTS } from '../constants'
import { getPersona } from './studioStore'

/**
 * A persona's system prompt replaces the effort preset entirely (the effort
 * prompt goes unused). Any lookup failure — deleted persona, storage error —
 * falls back to the effort preset so chat never breaks.
 */
export async function resolveSystemPrompt(base: Conversation): Promise<string> {
  if (!base.personaId) return EFFORT_PROMPTS[base.effort]
  try {
    const persona = await getPersona(base.personaId)
    return persona?.systemPrompt ?? EFFORT_PROMPTS[base.effort]
  } catch {
    return EFFORT_PROMPTS[base.effort]
  }
}
