/**
 * Small, local model preferences: the default model for new chats and a set of
 * favorited models. Persisted to localStorage (no sync, no accounts).
 */
import { formatModelRef, parseModelRef } from './providers/modelRef'

export interface ModelPrefs {
  defaultModel: string
  favorites: string[]
}

export const KEY = 'irisui.models'
export const EMPTY_PREFS: ModelPrefs = { defaultModel: '', favorites: [] }

/**
 * Values persisted before multi-provider are bare Ollama names. Re-qualify them
 * on read so old installs keep their default model and favorites; they are
 * written back in qualified form on the next save.
 */
function qualify(ref: string): string {
  if (!ref) return ref
  const { providerId, id } = parseModelRef(ref)
  return formatModelRef(providerId, id)
}

export function loadModelPrefs(): ModelPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY_PREFS
    const p = JSON.parse(raw) as Partial<ModelPrefs>
    return {
      defaultModel: typeof p.defaultModel === 'string' ? qualify(p.defaultModel) : '',
      favorites: Array.isArray(p.favorites)
        ? p.favorites.filter((x): x is string => typeof x === 'string').map(qualify)
        : [],
    }
  } catch {
    return EMPTY_PREFS
  }
}

export function saveModelPrefs(prefs: ModelPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
