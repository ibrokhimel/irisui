/**
 * Pure speech-recognition helpers. Kept out of the hook so the tricky
 * Chrome/Edge result semantics are unit-testable.
 */

import type { VoiceEngine } from './appSettings'

export interface SpeechResultLike {
  readonly isFinal: boolean
  readonly [index: number]: { readonly transcript: string }
}

export interface SpeechResultListLike {
  readonly length: number
  readonly [index: number]: SpeechResultLike
}

/**
 * Fold a recognition session's results into ONE complete transcript.
 *
 * Chrome/Edge deliver `results` cumulatively and advance `event.resultIndex`
 * past results that are already final — so reading from `resultIndex` yields
 * only the newest utterance. Any consumer that rewrites the input from a
 * snapshot would then drop everything said earlier in the session. Always fold
 * the whole list.
 */
export function transcriptFrom(results: SpeechResultListLike): {
  text: string
  isFinal: boolean
} {
  // Join utterances explicitly rather than raw-concatenating: engines are
  // inconsistent about whether a follow-up result carries a leading space, and
  // relying on that yields "hello worldhow are you".
  const parts: string[] = []
  for (let i = 0; i < results.length; i++) {
    const part = (results[i]?.[0]?.transcript ?? '').trim()
    if (part) parts.push(part)
  }
  const last = results.length > 0 ? results[results.length - 1] : undefined
  return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), isFinal: !!last?.isFinal }
}

/**
 * Human-readable reason a recognition session failed. Returns '' for benign
 * outcomes (silence, user-initiated abort) that shouldn't nag the user.
 */
export function speechErrorMessage(code: string): string {
  switch (code) {
    case 'no-speech':
    case 'aborted':
      return ''
    case 'not-allowed':
    case 'service-not-allowed':
      return "Microphone access is blocked. Allow it for this site in your browser's settings, then try again."
    case 'audio-capture':
      return 'No microphone found. Check that one is connected and enabled.'
    case 'network':
      return 'Speech recognition needs a connection to your browser’s speech service, which is unreachable.'
    default:
      return 'Voice input failed. Try again.'
  }
}

export type SpeechErrorKind = 'benign' | 'permission' | 'device' | 'service' | 'unknown'

/**
 * Classifies a recognition error code for fallback ROUTING (as opposed to
 * `speechErrorMessage`, which classifies for user-facing text). 'service'
 * covers both codes Chrome/Edge use when their remote speech backend is
 * unreachable — that's the one case where switching to on-device Whisper can
 * actually fix things. 'permission'/'device' are real local problems a
 * fallback can't help with, so callers must not react to those the same way.
 */
export function speechErrorKind(code: string): SpeechErrorKind {
  switch (code) {
    case 'network':
    case 'service-not-allowed':
      return 'service'
    case 'not-allowed':
      return 'permission'
    case 'audio-capture':
      return 'device'
    case 'no-speech':
    case 'aborted':
      return 'benign'
    default:
      return 'unknown'
  }
}

/**
 * Whether a recognition session should sticky-switch to on-device Whisper
 * after this error. Only 'auto' sessions may fall back — a session pinned to
 * 'web' means the user explicitly chose browser-only, so a dead remote
 * service should surface as an error rather than silently swap engines
 * underneath them; 'local' sessions never touch the browser engine at all.
 */
export function shouldFallbackToLocal(sessionMode: VoiceEngine, kind: SpeechErrorKind): boolean {
  return sessionMode === 'auto' && kind === 'service'
}
