import type { Effort } from '../types'
import { DEFAULT_TEMPERATURE, TEMP_MAX, TEMP_MIN } from '../constants'

/**
 * App-wide settings: the custom Ollama host and the defaults new chats start
 * with (effort / temperature). Persisted to localStorage (no sync, no
 * accounts) — mirrors theme.ts / modelPrefs.ts's load/save shape.
 */
export interface AppSettings {
  /** Custom Ollama host URL. '' = use the built-in default (dev proxy / localhost). */
  ollamaUrl: string
  defaultEffort: Effort
  defaultTemperature: number
}

export const KEY = 'irisui.settings'

const EFFORTS: Effort[] = ['fast', 'balanced', 'deep', 'ultrathink']

export const DEFAULT_SETTINGS: AppSettings = {
  ollamaUrl: '',
  defaultEffort: 'balanced',
  defaultTemperature: DEFAULT_TEMPERATURE,
}

function isEffort(v: unknown): v is Effort {
  return typeof v === 'string' && (EFFORTS as string[]).includes(v)
}

function clampTemperature(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.defaultTemperature
  return Math.min(TEMP_MAX, Math.max(TEMP_MIN, n))
}

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const p = JSON.parse(raw) as Partial<AppSettings>
    return {
      ollamaUrl: typeof p.ollamaUrl === 'string' ? p.ollamaUrl.trim() : DEFAULT_SETTINGS.ollamaUrl,
      defaultEffort: isEffort(p.defaultEffort) ? p.defaultEffort : DEFAULT_SETTINGS.defaultEffort,
      defaultTemperature:
        typeof p.defaultTemperature === 'number'
          ? clampTemperature(p.defaultTemperature)
          : DEFAULT_SETTINGS.defaultTemperature,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveAppSettings(s: AppSettings): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ollamaUrl: s.ollamaUrl.trim(),
        defaultEffort: isEffort(s.defaultEffort) ? s.defaultEffort : DEFAULT_SETTINGS.defaultEffort,
        defaultTemperature: clampTemperature(s.defaultTemperature),
      } satisfies AppSettings),
    )
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
