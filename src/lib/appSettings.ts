import type { Effort } from '../types'
import { DEFAULT_TEMPERATURE, NUM_CTX_MIN, TEMP_MAX, TEMP_MIN } from '../constants'

/**
 * 'auto' derives the window per model from its KV-cache geometry and the user's
 * RAM (see lib/kvCache.ts), rather than pinning one number that is wrong for
 * every model but one. A number pins it explicitly — the escape hatch for when
 * our estimate is off, which it can be: a browser cannot see VRAM.
 */
export type NumCtxSetting = number | 'auto'

/** Which engine turns speech into text.
 *  auto  - try the browser's service, fall back to on-device Whisper if it's unreachable
 *  web   - browser SpeechRecognition only (streams interim results; needs Google/Microsoft)
 *  local - on-device Whisper only (private, offline, batch-transcribes after you stop) */
export type VoiceEngine = 'auto' | 'web' | 'local'

/**
 * App-wide settings: the custom Ollama host, the defaults new chats start with
 * (effort / temperature / context window), and voice input+output preferences.
 * Persisted to localStorage (no sync, no accounts) — mirrors theme.ts /
 * modelPrefs.ts's load/save shape.
 */
export interface AppSettings {
  /** Custom Ollama host URL. '' = use the built-in default (dev proxy / localhost). */
  ollamaUrl: string
  defaultEffort: Effort
  defaultTemperature: number
  /** num_ctx new chats start with. 'auto' = derive it per model. */
  defaultNumCtx: NumCtxSetting
  voiceEngine: VoiceEngine
  /** Hugging Face repo id of the on-device Whisper model. See lib/asrModels.ts. */
  asrModel: string
  /** SpeechSynthesisVoice.voiceURI for read-aloud. '' = the system default voice. */
  ttsVoiceURI: string
}

export const KEY = 'irisui.settings'

const EFFORTS: Effort[] = ['fast', 'balanced', 'deep', 'ultrathink']
const ENGINES: VoiceEngine[] = ['auto', 'web', 'local']

export const DEFAULT_ASR_MODEL = 'onnx-community/whisper-base'

export const DEFAULT_SETTINGS: AppSettings = {
  ollamaUrl: '',
  defaultEffort: 'balanced',
  defaultTemperature: DEFAULT_TEMPERATURE,
  defaultNumCtx: 'auto',
  voiceEngine: 'auto',
  asrModel: DEFAULT_ASR_MODEL,
  ttsVoiceURI: '',
}

function isEffort(v: unknown): v is Effort {
  return typeof v === 'string' && (EFFORTS as string[]).includes(v)
}

function isEngine(v: unknown): v is VoiceEngine {
  return typeof v === 'string' && (ENGINES as string[]).includes(v)
}

function clampTemperature(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.defaultTemperature
  return Math.min(TEMP_MAX, Math.max(TEMP_MIN, n))
}

/** Any positive integer is legal (models differ wildly); only the floor is enforced. */
export function clampNumCtx(n: number): number {
  if (!Number.isFinite(n)) return NUM_CTX_MIN
  return Math.max(NUM_CTX_MIN, Math.round(n))
}

function readNumCtx(v: unknown): NumCtxSetting {
  if (v === 'auto') return 'auto'
  // A non-finite number is garbage, not a request for the smallest window —
  // fall back to the default rather than silently pinning the chat to 512.
  if (typeof v === 'number' && Number.isFinite(v)) return clampNumCtx(v)
  return DEFAULT_SETTINGS.defaultNumCtx
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
      defaultNumCtx: readNumCtx(p.defaultNumCtx),
      voiceEngine: isEngine(p.voiceEngine) ? p.voiceEngine : DEFAULT_SETTINGS.voiceEngine,
      asrModel:
        typeof p.asrModel === 'string' && p.asrModel.trim()
          ? p.asrModel.trim()
          : DEFAULT_SETTINGS.asrModel,
      ttsVoiceURI:
        typeof p.ttsVoiceURI === 'string' ? p.ttsVoiceURI : DEFAULT_SETTINGS.ttsVoiceURI,
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
        defaultNumCtx: readNumCtx(s.defaultNumCtx),
        voiceEngine: isEngine(s.voiceEngine) ? s.voiceEngine : DEFAULT_SETTINGS.voiceEngine,
        asrModel: s.asrModel.trim() || DEFAULT_SETTINGS.asrModel,
        ttsVoiceURI: s.ttsVoiceURI,
      } satisfies AppSettings),
    )
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
