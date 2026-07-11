import { useCallback, useState } from 'react'
import type { AppSettings } from '../lib/appSettings'
import { DEFAULT_SETTINGS, loadAppSettings, saveAppSettings } from '../lib/appSettings'

/** Holds the current app settings (Ollama host + chat defaults) and persists on change. */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings())

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch }
      saveAppSettings(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
    saveAppSettings(DEFAULT_SETTINGS)
  }, [])

  return { settings, update, reset }
}
