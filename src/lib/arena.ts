import type { OllamaModel } from '../types'
import { isLikelyEmbeddingModel } from './modelCatalog'

/** Chat-capable installed models (excludes likely-embedding models) for arena pickers. */
export function chatableModels(models: OllamaModel[]): OllamaModel[] {
  return models.filter((m) => !isLikelyEmbeddingModel(m.name))
}

/**
 * Grow or shrink a selection to exactly `count` slots, filling any new slots
 * with a chatable model not already picked (keeps columns distinct by default;
 * the user can still override with a duplicate manually). Passing an empty
 * `selected` also doubles as "pick N sensible defaults".
 */
export function resizeSelection(
  selected: string[],
  count: number,
  models: OllamaModel[],
): string[] {
  const next = selected.slice(0, count)
  const names = chatableModels(models).map((m) => m.name)
  while (next.length < count) {
    const used = new Set(next.filter(Boolean))
    const candidate = names.find((n) => !used.has(n)) ?? ''
    next.push(candidate)
  }
  return next
}

export type ArenaColumnStatus = 'idle' | 'streaming' | 'done' | 'error' | 'stopped'

/** True once every column has left the idle/streaming state — gates "Best answer". */
export function allColumnsSettled(statuses: ArenaColumnStatus[]): boolean {
  return statuses.length > 0 && statuses.every((s) => s !== 'idle' && s !== 'streaming')
}

/** Run is only meaningful with a prompt and every model slot filled. */
export function canRunArena(prompt: string, selected: string[], running: boolean): boolean {
  return !running && prompt.trim().length > 0 && selected.length >= 2 && selected.every(Boolean)
}
