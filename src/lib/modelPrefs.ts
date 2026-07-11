/**
 * Small, local model preferences: the default model for new chats and a set of
 * favorited models. Persisted to localStorage (no sync, no accounts).
 */
export interface ModelPrefs {
  defaultModel: string
  favorites: string[]
}

export const KEY = 'irisui.models'
export const EMPTY_PREFS: ModelPrefs = { defaultModel: '', favorites: [] }

export function loadModelPrefs(): ModelPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY_PREFS
    const p = JSON.parse(raw) as Partial<ModelPrefs>
    return {
      defaultModel: typeof p.defaultModel === 'string' ? p.defaultModel : '',
      favorites: Array.isArray(p.favorites)
        ? p.favorites.filter((x): x is string => typeof x === 'string')
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
