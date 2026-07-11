import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechResultListLike } from '../lib/speech'
import { shouldFallbackToLocal, speechErrorKind, speechErrorMessage, transcriptFrom } from '../lib/speech'
import { loadAppSettings, saveAppSettings, type VoiceEngine } from '../lib/appSettings'
import { isWhisperSupported, loadWhisper, transcribe as transcribeWithWhisper } from '../lib/whisper'
import { startRecording, type Recorder } from '../lib/recorder'

// `Message.tsx` imports these three re-exports and must keep compiling
// untouched — the read-aloud implementation lives in lib/tts now.
export { isSpeechSynthesisSupported, speak, stopSpeaking } from '../lib/tts'

/**
 * Minimal ambient types for the (still-unstandardized) SpeechRecognition
 * API — not shipped in TypeScript's lib.dom.d.ts, so declared locally
 * instead of pulling in a @types package.
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

export type VoiceInputStatus = 'idle' | 'listening' | 'downloading' | 'transcribing'

/**
 * Push-to-talk voice input with two engines: the browser's SpeechRecognition
 * (streams audio to Google/Microsoft, gives interim results) and an on-device
 * Whisper fallback (private/offline, batch-only). `onTranscript` fires on
 * every recognition update with the text since the last change and whether
 * this chunk is final — Whisper only ever emits one final chunk per session.
 */
export function useSpeechInput(onTranscript: (text: string, isFinal: boolean) => void) {
  const supported = !!getRecognitionCtor() || isWhisperSupported()
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const [engine, setEngine] = useState<'web' | 'local'>(() =>
    loadAppSettings().voiceEngine === 'local' ? 'local' : 'web',
  )
  const [status, setStatus] = useState<VoiceInputStatus>('idle')
  const [downloadPct, setDownloadPct] = useState(0)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<Recorder | null>(null)
  // Which mode ('auto'/'web'/'local') the CURRENT session was launched under —
  // read once at start so a mid-session settings change can't affect whether
  // this session's error handler is allowed to sticky-switch engines.
  const sessionModeRef = useRef<VoiceEngine>('auto')
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  const startLocal = useCallback(async (modelId?: string) => {
    try {
      if (!isWhisperSupported()) {
        setError(
          'On-device transcription needs a browser with WebAssembly, Web Workers, and microphone access.',
        )
        return
      }
      setEngine('local')
      setStatus('downloading')
      setDownloadPct(0)
      await loadWhisper(modelId ?? loadAppSettings().asrModel, (pct) => setDownloadPct(pct))
      const recorder = await startRecording()
      recorderRef.current = recorder
      setStatus('listening')
      setListening(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'On-device transcription failed to start.')
      setStatus('idle')
      setListening(false)
    }
  }, [])

  const stopLocal = useCallback(async () => {
    const recorder = recorderRef.current
    recorderRef.current = null
    if (!recorder) return
    setListening(false)
    setStatus('transcribing')
    try {
      const audio = await recorder.stop()
      const text = await transcribeWithWhisper(audio)
      onTranscriptRef.current(text, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed. Try again.')
    } finally {
      setStatus('idle')
    }
  }, [])

  const startWeb = useCallback((): boolean => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return false
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
      const kind = speechErrorKind(event.error)
      if (shouldFallbackToLocal(sessionModeRef.current, kind)) {
        const settings = loadAppSettings()
        saveAppSettings({ ...settings, voiceEngine: 'local' })
        setError(
          'Browser speech service is unreachable — switched to on-device transcription. First use downloads a small model.',
        )
        setListening(false)
        setStatus('idle')
        void startLocal(settings.asrModel)
        return
      }
      setError(speechErrorMessage(event.error))
      setListening(false)
      setStatus('idle')
    }
    recognition.onend = () => {
      setListening(false)
      setStatus((s) => (s === 'listening' ? 'idle' : s))
    }
    recognitionRef.current = recognition
    setError('')
    try {
      recognition.start()
      setEngine('web')
      setStatus('listening')
      setListening(true)
    } catch {
      // start() throws if a session is somehow already running.
      setListening(false)
    }
    return true
  }, [startLocal])

  const stopWeb = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const toggle = useCallback(() => {
    // Busy states (downloading the model, transcribing the last recording)
    // aren't interruptible by a mic click — ChatInput disables the button
    // too, but guard here since toggle() is the one shared entry point.
    if (status === 'downloading' || status === 'transcribing') return

    if (listening) {
      if (engine === 'local') void stopLocal()
      else stopWeb()
      return
    }

    setError('')
    const settings = loadAppSettings()
    sessionModeRef.current = settings.voiceEngine

    if (settings.voiceEngine === 'local') {
      void startLocal(settings.asrModel)
      return
    }
    if (settings.voiceEngine === 'web') {
      const started = startWeb()
      if (!started) {
        setError('This browser does not support the Web Speech API. Switch to on-device recognition in Settings.')
      }
      return
    }
    // 'auto': prefer the browser engine; if it doesn't exist at all in this
    // browser (e.g. Firefox), there's nothing to "fall back from" — go
    // straight to local. The reactive fallback (mid-session 'service' error)
    // is handled in startWeb's onerror above.
    if (!startWeb()) void startLocal(settings.asrModel)
  }, [listening, engine, status, startWeb, stopWeb, startLocal, stopLocal])

  const clearError = useCallback(() => setError(''), [])

  // Release the mic / abort a still-running session if the component
  // unmounts (e.g. the composer swaps between the hero/docked variant).
  useEffect(
    () => () => {
      recognitionRef.current?.abort()
      recorderRef.current?.cancel()
    },
    [],
  )

  return { supported, listening, error, clearError, toggle, engine, status, downloadPct }
}
