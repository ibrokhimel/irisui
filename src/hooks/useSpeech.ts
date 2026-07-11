import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechResultListLike } from '../lib/speech'
import { speechErrorMessage, transcriptFrom } from '../lib/speech'

/**
 * Minimal ambient types for the (still-unstandardized) SpeechRecognition
 * API — not shipped in TypeScript's lib.dom.d.ts, so declared locally
 * instead of pulling in a @types package. SpeechSynthesis /
 * SpeechSynthesisUtterance ARE already in lib.dom.d.ts and need no
 * augmentation.
 */
interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: SpeechResultListLike
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

function getRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  return window.SpeechRecognition || window.webkitSpeechRecognition
}

/**
 * Push-to-talk voice input. `onTranscript` fires on every recognition
 * update with the recognized text since the last change and whether this
 * chunk is final. Unsupported browsers get `supported: false` — callers
 * should hide the mic button in that case rather than call `toggle`.
 */
export function useSpeechInput(onTranscript: (text: string, isFinal: boolean) => void) {
  const supported = !!getRecognitionCtor()
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    const recognition = new Ctor()
    recognition.lang = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    // Fold the WHOLE session — Chrome advances resultIndex past finalized
    // utterances, so reading from it would hand back only the newest phrase
    // and the composer would overwrite everything said before it.
    recognition.onresult = (event) => {
      const { text, isFinal } = transcriptFrom(event.results)
      onTranscriptRef.current(text, isFinal)
    }
    recognition.onerror = (event) => {
      setError(speechErrorMessage(event.error))
      setListening(false)
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    setError('')
    try {
      recognition.start()
      setListening(true)
    } catch {
      // start() throws if a session is somehow already running.
      setListening(false)
    }
  }, [])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  const clearError = useCallback(() => setError(''), [])

  // Abort a still-running session if the component unmounts (e.g. the
  // composer swaps between the hero/docked variant).
  useEffect(() => () => recognitionRef.current?.abort(), [])

  return { supported, listening, error, clearError, toggle }
}

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

/** Read text aloud. Cancels any in-flight utterance first (one voice at a time). */
export function speak(text: string, onEnd?: () => void): void {
  if (!isSpeechSynthesisSupported()) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(stripMarkdown(text))
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
