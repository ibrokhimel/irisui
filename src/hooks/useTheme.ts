import { useCallback, useEffect, useState } from 'react'
import type { CustomThemeVars, ThemePreset, ThemeSettings } from '../theme'
import { DEFAULT_THEME, applyTheme, loadTheme, saveTheme, seedCustomFromPreset } from '../theme'

/** Holds the current theme, applies it to <html> on change, and persists it. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeSettings>(() => loadTheme())

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  // Selecting Custom for the first time seeds the editor from the preset the
  // user is looking at, so they tweak from something coherent.
  const setPreset = useCallback(
    (preset: ThemePreset) =>
      setTheme((t) =>
        preset === 'custom'
          ? {
              ...t,
              preset,
              custom: t.custom ?? seedCustomFromPreset(t.preset === 'custom' ? 'dark' : t.preset),
            }
          : { ...t, preset },
      ),
    [],
  )
  const setAccent = useCallback((accent: string) => setTheme((t) => ({ ...t, accent })), [])
  const setCustomVar = useCallback(
    (key: keyof CustomThemeVars, hex: string) =>
      setTheme((t) => ({
        ...t,
        preset: 'custom',
        custom: {
          ...(t.custom ?? seedCustomFromPreset(t.preset === 'custom' ? 'dark' : t.preset)),
          [key]: hex,
        },
      })),
    [],
  )
  const seedCustomFrom = useCallback(
    (preset: Exclude<ThemePreset, 'custom'>) =>
      setTheme((t) => ({ ...t, preset: 'custom', custom: seedCustomFromPreset(preset) })),
    [],
  )
  // Reset returns to the default preset but keeps the saved custom colors, so
  // re-selecting Custom restores the user's palette.
  const reset = useCallback(() => setTheme((t) => ({ ...DEFAULT_THEME, custom: t.custom })), [])

  return { theme, setPreset, setAccent, setCustomVar, seedCustomFrom, reset }
}
