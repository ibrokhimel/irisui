import { DEFAULT_ASR_MODEL } from './appSettings'

/**
 * On-device Whisper models selectable in Settings. Repo ids are verified to
 * exist under the onnx-community namespace (pre-converted to ONNX, which is
 * what @huggingface/transformers' `pipeline()` requires — a plain PyTorch
 * Whisper checkpoint won't load in-browser).
 */
export interface AsrModel {
  id: string
  label: string
  sizeMb: number
  note: string
}

export const ASR_MODELS: AsrModel[] = [
  {
    id: 'onnx-community/whisper-tiny.en',
    label: 'Whisper Tiny (English)',
    sizeMb: 40,
    note: 'Fastest. English only.',
  },
  {
    id: 'onnx-community/whisper-base',
    label: 'Whisper Base',
    sizeMb: 80,
    note: 'Balanced. Multilingual — the default.',
  },
  {
    id: 'onnx-community/whisper-small',
    label: 'Whisper Small',
    sizeMb: 250,
    note: 'Most accurate. Multilingual, slowest, largest download.',
  },
]

/** Falls back to the app default whenever `id` isn't in the catalog (stale/edited-by-hand settings). */
export function findAsrModel(id: string | undefined | null): AsrModel {
  const found = ASR_MODELS.find((m) => m.id === id)
  if (found) return found
  return ASR_MODELS.find((m) => m.id === DEFAULT_ASR_MODEL) ?? ASR_MODELS[0]
}
