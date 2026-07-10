import { useCallback, useEffect, useState } from 'react'
import type { ThemePreset, ThemeSettings } from '../theme'
import { DEFAULT_THEME, applyTheme, loadTheme, saveTheme } from '../theme'

/** Holds the current theme, applies it to <html> on change, and persists it. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeSettings>(() => loadTheme())

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  const setPreset = useCallback((preset: ThemePreset) => setTheme((t) => ({ ...t, preset })), [])
  const setAccent = useCallback((accent: string) => setTheme((t) => ({ ...t, accent })), [])
  const reset = useCallback(() => setTheme(DEFAULT_THEME), [])

  return { theme, setPreset, setAccent, reset }
}
