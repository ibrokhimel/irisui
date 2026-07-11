import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Minimal ambient types for the (still-unstandardized) SpeechRecognition
 * API — not shipped in TypeScript's lib.dom.d.ts, so declared locally
 * instead of pulling in a @types package. SpeechSynthesis /
 * SpeechSynthesisUtterance ARE already in lib.dom.d.ts and need no
 * augmentation.
 */
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly [index: number]: { readonly transcript: string }
}

interface SpeechRecognitionResultListLike {
  readonly length: number
  readonly [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
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
    recognition.onresult = (event) => {
      let text = ''
      let isFinal = false
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        text += result[0].transcript
        if (result.isFinal) isFinal = true
      }
      onTranscriptRef.current(text, isFinal)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  // Abort a still-running session if the component unmounts (e.g. the
  // composer swaps between the hero/docked variant).
  useEffect(() => () => recognitionRef.current?.abort(), [])

  return { supported, listening, toggle }
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
