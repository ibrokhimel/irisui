/**
 * Pure speech-recognition helpers. Kept out of the hook so the tricky
 * Chrome/Edge result semantics are unit-testable.
 */

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
