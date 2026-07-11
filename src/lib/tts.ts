import { loadAppSettings } from './appSettings'

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Crude markdown-to-speech cleanup: drop fences, headings, emphasis markers, and link syntax. */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Chrome resolves voices asynchronously — `getVoices()` often returns `[]` on
 * the very first call, filling in only once `voiceschanged` fires. The list
 * is cached so later callers within the same page life don't re-race it.
 */
let cachedVoices: SpeechSynthesisVoice[] = []

export function listVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return []
  const voices = window.speechSynthesis.getVoices()
  if (voices.length > 0) {
    cachedVoices = voices
  } else if (cachedVoices.length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoices = window.speechSynthesis.getVoices()
    }
  }
  return voices.length > 0 ? voices : cachedVoices
}

/**
 * Pure so it's unit-testable without a real SpeechSynthesis implementation.
 * Falls back to the system default (undefined = let the engine pick) when
 * `voiceURI` is empty or no longer matches an installed voice.
 */
export function resolveTtsVoice(
  voiceURI: string,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  if (!voiceURI) return undefined
  return voices.find((v) => v.voiceURI === voiceURI)
}

/** Read text aloud using the voice saved in settings. Cancels any in-flight utterance first. */
export function speak(text: string, onEnd?: () => void): void {
  if (!isSpeechSynthesisSupported()) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(stripMarkdown(text))
  const voice = resolveTtsVoice(loadAppSettings().ttsVoiceURI, listVoices())
  if (voice) utterance.voice = voice
  if (onEnd) {
    utterance.onend = onEnd
    utterance.onerror = onEnd
  }
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return
  window.speechSynthesis.cancel()
}
