import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  AlertTriangle,
  ArrowUp,
  BookOpen,
  ChevronDown,
  Loader2,
  Mic,
  MicOff,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react'
import { SPRING, TAP } from '../lib/motion'
import type { Effort, OllamaModel, OllamaStatus } from '../types'
import { EFFORT_OPTIONS, TEMP_MAX, TEMP_MIN, TEMP_STEP } from '../constants'
import { DEFAULT_EMBED_MODEL } from '../lib/rag'
import { useSpeechInput } from '../hooks/useSpeech'
import { Banner, ContextFullNotice } from './ComposerBanner'

export interface KbOption {
  id: string
  name: string
}

const STATUS_DOT: Record<OllamaStatus, string> = {
  checking: 'bg-muted',
  online: 'bg-emerald-500',
  'no-models': 'bg-amber-500',
  offline: 'bg-rose-500',
}

export function ChatInput({
  variant,
  input,
  setInput,
  onSend,
  onStop,
  isStreaming,
  canSend,
  status,
  effort,
  setEffort,
  temperature,
  setTemperature,
  models,
  selectedModel,
  onSelectModel,
  kbs,
  selectedKbId,
  onSelectKb,
  ragNotice,
  onDismissRagNotice,
  persona,
  onClearPersona,
  contextFull,
  contextLimit,
  summarizing,
  onSummarize,
  onNewChat,
}: {
  variant: 'hero' | 'docked'
  input: string
  setInput: (value: string) => void
  onSend: () => void
  onStop: () => void
  isStreaming: boolean
  canSend: boolean
  contextFull: boolean
  contextLimit: number
  summarizing: boolean
  onSummarize: () => void
  onNewChat: () => void
  status: OllamaStatus
  effort: Effort
  setEffort: (effort: Effort) => void
  temperature: number
  setTemperature: (value: number) => void
  models: OllamaModel[]
  selectedModel: string
  onSelectModel: (name: string) => void
  kbs: KbOption[]
  selectedKbId?: string
  onSelectKb: (id: string | undefined) => void
  ragNotice: boolean
  onDismissRagNotice: () => void
  persona?: { icon: string; name: string }
  onClearPersona: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)
  const selectedKb = kbs.find((k) => k.id === selectedKbId)

  // Voice input appends onto whatever was already typed when the mic was
  // pressed — `baseInput` is snapshotted at the start of each listening session.
  const baseInputRef = useRef('')
  const {
    supported: micSupported,
    listening,
    error: micError,
    clearError: clearMicError,
    toggle: toggleMic,
    engine: micEngine,
    status: voiceStatus,
    downloadPct,
  } = useSpeechInput((text) => {
    const base = baseInputRef.current
    const sep = base && !base.endsWith(' ') ? ' ' : ''
    setInput(text ? base + sep + text : base)
  })
  const micBusy = voiceStatus === 'downloading' || voiceStatus === 'transcribing'
  const voiceBusyLabel =
    voiceStatus === 'downloading' ? `Downloading on-device speech model… ${downloadPct}%` : 'Transcribing…'
  const micListeningTitle =
    micEngine === 'local' ? 'Recording… click to stop and transcribe' : 'Listening… click to stop'
  const micTitle = listening ? micListeningTitle : micBusy ? voiceBusyLabel : 'Voice input'
  const handleMicClick = () => {
    if (!listening) baseInputRef.current = input
    toggleMic()
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [input])

  useEffect(() => {
    if (!controlsOpen && !kbOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setControlsOpen(false)
        setKbOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controlsOpen, kbOpen])

  const sendDisabled = input.trim().length === 0 || !canSend

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isStreaming && !sendDisabled) onSend()
    }
  }

  const placeholder =
    status === 'offline'
      ? 'Ollama is offline — start it, then refresh…'
      : status === 'no-models'
        ? 'No models installed — run: ollama pull llama3.1:8b'
        : status === 'checking'
          ? 'Connecting to Ollama…'
          : 'How can I help you today?'

  const shell = variant === 'docked' ? 'border-t border-line bg-bg px-4 py-4' : ''
  const inner = variant === 'docked' ? 'mx-auto w-full max-w-3xl' : 'w-full'

  return (
    <div className={shell}>
      <div className={inner}>
        <ContextFullNotice
          show={contextFull}
          limit={contextLimit}
          summarizing={summarizing}
          onSummarize={onSummarize}
          onNewChat={onNewChat}
        />

        <Banner show={ragNotice} tone="amber" icon={AlertTriangle} onDismiss={onDismissRagNotice} dismissLabel="Dismiss notice">
          Knowledge attached but embedding model missing — install {DEFAULT_EMBED_MODEL} in Knowledge.
        </Banner>

        <Banner show={micBusy} tone="muted" icon={Loader2} iconClassName="animate-spin">
          {voiceBusyLabel}
        </Banner>

        <Banner show={!!micError} tone="rose" icon={AlertTriangle} onDismiss={clearMicError} dismissLabel="Dismiss voice error">
          {micError}
        </Banner>

        <div className="rounded-3xl border border-line bg-panel2 shadow-[0_4px_24px_-12px_rgba(0,0,0,0.5)] transition focus-within:border-iris/50">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={variant === 'hero' ? 2 : 1}
            placeholder={placeholder}
            className="block max-h-[220px] w-full resize-none bg-transparent px-5 pb-2 pt-4 text-[15px] leading-relaxed text-fg outline-none placeholder:text-muted/60"
          />

          <div className="flex items-center gap-2 px-3 pb-3 pt-1">
            {/* Generation controls */}
            <div className="relative">
              <button
                onClick={() => setControlsOpen((o) => !o)}
                aria-label="Generation options"
                aria-expanded={controlsOpen}
                className={
                  'flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-panel hover:text-fg ' +
                  (controlsOpen ? 'bg-panel text-fg' : '')
                }
              >
                <SlidersHorizontal className="h-[18px] w-[18px]" />
              </button>

              {controlsOpen && (
                <button
                  className="fixed inset-0 z-10 cursor-default"
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={() => setControlsOpen(false)}
                />
              )}
              <AnimatePresence>
              {controlsOpen && (
                  <m.div
                    initial={{ opacity: 0, scale: 0.95, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: 4 }}
                    transition={{ duration: 0.14, ease: 'easeOut' }}
                    className="absolute bottom-full left-0 z-20 mb-2 w-64 origin-bottom-left rounded-xl border border-line bg-panel p-3 shadow-xl"
                  >
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Effort
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {EFFORT_OPTIONS.map((o) => {
                        const active = effort === o.value
                        return (
                          <button
                            key={o.value}
                            onClick={() => setEffort(o.value)}
                            title={o.hint}
                            className={
                              'rounded-lg border px-2 py-1.5 text-xs font-medium transition ' +
                              (active
                                ? 'border-iris bg-iris/10 text-fg'
                                : 'border-line text-muted hover:border-iris/40 hover:text-fg')
                            }
                          >
                            {o.label}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mb-1.5 mt-3 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        Temperature
                      </p>
                      <span className="font-mono text-xs text-fg">{temperature.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={TEMP_MIN}
                      max={TEMP_MAX}
                      step={TEMP_STEP}
                      value={temperature}
                      onChange={(e) => setTemperature(Number(e.target.value))}
                      aria-label="Temperature"
                      className="h-1 w-full cursor-pointer accent-[var(--color-iris)]"
                    />
                  </m.div>
              )}
              </AnimatePresence>
            </div>

            {/* Knowledge base picker */}
            <div className="relative">
              <button
                onClick={() => setKbOpen((o) => !o)}
                disabled={isStreaming}
                aria-label="Attach a knowledge base"
                aria-expanded={kbOpen}
                title={selectedKb ? `Knowledge: ${selectedKb.name}` : 'Attach a knowledge base'}
                className={
                  'flex h-8 items-center gap-1.5 rounded-lg px-2 text-muted transition hover:bg-panel hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ' +
                  (selectedKb
                    ? 'bg-iris/10 text-iris hover:text-iris'
                    : kbOpen
                      ? 'bg-panel text-fg'
                      : '')
                }
              >
                <BookOpen className="h-[18px] w-[18px]" />
                {selectedKb && (
                  <span className="max-w-[110px] truncate text-xs font-medium">{selectedKb.name}</span>
                )}
              </button>

              {kbOpen && (
                <button
                  className="fixed inset-0 z-10 cursor-default"
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={() => setKbOpen(false)}
                />
              )}
              <AnimatePresence>
                {kbOpen && (
                  <m.div
                    initial={{ opacity: 0, scale: 0.95, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: 4 }}
                    transition={{ duration: 0.14, ease: 'easeOut' }}
                    className="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-60 origin-bottom-left overflow-y-auto rounded-xl border border-line bg-panel p-1.5 shadow-xl"
                  >
                    <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Knowledge base
                    </p>
                    <KbItem
                      active={!selectedKbId}
                      onClick={() => {
                        onSelectKb(undefined)
                        setKbOpen(false)
                      }}
                    >
                      None
                    </KbItem>
                    {kbs.map((kb) => (
                      <KbItem
                        key={kb.id}
                        active={kb.id === selectedKbId}
                        onClick={() => {
                          onSelectKb(kb.id)
                          setKbOpen(false)
                        }}
                      >
                        {kb.name}
                      </KbItem>
                    ))}
                    {kbs.length === 0 && (
                      <p className="px-2 py-2 text-xs text-muted">
                        No knowledge bases yet. Create one in Knowledge.
                      </p>
                    )}
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            {/* Voice input */}
            {micSupported && (
              <button
                type="button"
                onClick={handleMicClick}
                disabled={micBusy}
                aria-label={listening ? 'Stop voice input' : 'Voice input'}
                aria-pressed={listening}
                title={micTitle}
                className={
                  'flex h-8 w-8 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-60 ' +
                  (listening
                    ? 'mic-listening bg-iris/10 text-iris'
                    : 'text-muted hover:bg-panel hover:text-fg')
                }
              >
                {micBusy ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                ) : listening ? (
                  <MicOff className="h-[18px] w-[18px]" />
                ) : (
                  <Mic className="h-[18px] w-[18px]" />
                )}
              </button>
            )}

            {/* Right cluster: persona chip + model picker + send */}
            <div className="ml-auto flex items-center gap-1.5">
              {persona && (
                <button
                  onClick={onClearPersona}
                  title={`Persona: ${persona.name} — click to clear`}
                  className="flex items-center gap-1.5 rounded-lg border border-iris/30 bg-iris/10 px-2 py-1.5 text-xs font-medium text-iris transition hover:border-iris/50"
                >
                  <span className="text-sm leading-none">{persona.icon}</span>
                  <span className="max-w-[100px] truncate">{persona.name}</span>
                  <X className="h-3 w-3" />
                </button>
              )}
              <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition hover:bg-panel">
                <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + STATUS_DOT[status]} />
                <div className="relative flex items-center">
                  <select
                    value={selectedModel}
                    onChange={(e) => onSelectModel(e.target.value)}
                    disabled={isStreaming || models.length === 0}
                    aria-label="Selected model"
                    className="max-w-[170px] cursor-pointer appearance-none truncate bg-transparent pr-4 text-xs font-medium text-muted outline-none transition hover:text-fg disabled:cursor-not-allowed"
                  >
                    {models.length === 0 ? (
                      <option value="">No models</option>
                    ) : (
                      models.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name}
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                </div>
              </div>

              {isStreaming ? (
                <m.button
                  onClick={onStop}
                  aria-label="Stop generating"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileTap={TAP}
                  transition={SPRING}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-panel text-fg transition-colors hover:border-rose-500/50 hover:text-rose-200"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </m.button>
              ) : (
                <m.button
                  onClick={onSend}
                  disabled={sendDisabled}
                  aria-label="Send message"
                  whileTap={TAP}
                  whileHover={sendDisabled ? undefined : { scale: 1.05 }}
                  transition={SPRING}
                  className="btn-primary flex h-9 w-9 items-center justify-center rounded-xl shadow-sm"
                >
                  <ArrowUp className="h-[18px] w-[18px]" />
                </m.button>
              )}
            </div>
          </div>
        </div>

        {variant === 'docked' && (
          <p className="mt-2 px-1 text-center text-[11px] text-muted/60">
            IrisUI runs entirely on your machine via Ollama · Enter to send · Shift+Enter for a new line
          </p>
        )}
      </div>
    </div>
  )
}

function KbItem({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex w-full items-center gap-2 truncate rounded-lg px-2 py-1.5 text-left text-sm transition ' +
        (active ? 'bg-iris/10 text-iris' : 'text-muted hover:bg-panel2 hover:text-fg')
      }
    >
      <span className="truncate">{children}</span>
    </button>
  )
}
