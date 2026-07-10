import { useCallback, useState } from 'react'
import type { ModelPrefs } from '../lib/modelPrefs'
import { loadModelPrefs, saveModelPrefs } from '../lib/modelPrefs'

/** Reactive wrapper over the persisted model preferences. */
export function useModelPrefs() {
  const [prefs, setPrefs] = useState<ModelPrefs>(() => loadModelPrefs())

  const commit = (next: ModelPrefs) => {
    setPrefs(next)
    saveModelPrefs(next)
    return next
  }

  // Toggle: clicking the current default clears it.
  const setDefaultModel = useCallback(
    (name: string) =>
      setPrefs((p) => commit({ ...p, defaultModel: p.defaultModel === name ? '' : name })),
    [],
  )

  const toggleFavorite = useCallback(
    (name: string) =>
      setPrefs((p) =>
        commit({
          ...p,
          favorites: p.favorites.includes(name)
            ? p.favorites.filter((f) => f !== name)
            : [...p.favorites, name],
        }),
      ),
    [],
  )

  return { prefs, setDefaultModel, toggleFavorite }
}
