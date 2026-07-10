import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, ChevronDown, SlidersHorizontal, Square } from 'lucide-react'
import type { Effort, OllamaModel, OllamaStatus } from '../types'
import { EFFORT_OPTIONS, TEMP_MAX, TEMP_MIN, TEMP_STEP } from '../constants'

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
}: {
  variant: 'hero' | 'docked'
  input: string
  setInput: (value: string) => void
  onSend: () => void
  onStop: () => void
  isStreaming: boolean
  canSend: boolean
  status: OllamaStatus
  effort: Effort
  setEffort: (effort: Effort) => void
  temperature: number
  setTemperature: (value: number) => void
  models: OllamaModel[]
  selectedModel: string
  onSelectModel: (name: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [controlsOpen, setControlsOpen] = useState(false)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [input])

  useEffect(() => {
    if (!controlsOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setControlsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controlsOpen])

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

  const shell =
    variant === 'docked' ? 'border-t border-line bg-bg px-4 py-4' : ''
  const inner = variant === 'docked' ? 'mx-auto w-full max-w-3xl' : 'w-full'

  return (
    <div className={shell}>
      <div className={inner}>
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
                <>
                  <button
                    className="fixed inset-0 z-10 cursor-default"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={() => setControlsOpen(false)}
                  />
                  <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xl border border-line bg-panel p-3 shadow-xl">
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
                  </div>
                </>
              )}
            </div>

            {/* Right cluster: model picker + send */}
            <div className="ml-auto flex items-center gap-1.5">
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
                <button
                  onClick={onStop}
                  aria-label="Stop generating"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-panel text-fg transition hover:border-rose-500/50 hover:text-rose-200"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={sendDisabled}
                  aria-label="Send message"
                  className="btn-primary flex h-9 w-9 items-center justify-center rounded-xl shadow-sm transition"
                >
                  <ArrowUp className="h-[18px] w-[18px]" />
                </button>
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
