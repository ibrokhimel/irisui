import { useEffect, useRef, type KeyboardEvent } from 'react'
import { ChevronDown, Send, Square } from 'lucide-react'
import type { Effort, OllamaStatus } from '../types'
import { EFFORT_OPTIONS, TEMP_MAX, TEMP_MIN, TEMP_STEP } from '../constants'

export function ChatInput({
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
}: {
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
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow the textarea up to a sensible max height.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

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
          : 'Message IrisUI…'

  return (
    <div className="border-t border-line bg-panel/40 px-4 py-4 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-line bg-panel2 shadow-[0_2px_16px_-10px_rgba(0,0,0,0.35)] transition focus-within:border-iris/60">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={placeholder}
            className="block max-h-[200px] w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[15px] leading-relaxed text-fg outline-none placeholder:text-muted/70"
          />

          <div className="flex items-center gap-2 px-3 pb-3 pt-1">
            {/* Effort preset */}
            <div className="relative">
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value as Effort)}
                disabled={isStreaming}
                aria-label="Reasoning effort"
                title="Effort — adjusts the system prompt"
                className="appearance-none rounded-lg border border-line bg-panel py-1.5 pl-2.5 pr-7 text-xs font-medium text-fg outline-none transition hover:border-iris/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {EFFORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            </div>

            {/* Temperature */}
            <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Temp</span>
              <input
                type="range"
                min={TEMP_MIN}
                max={TEMP_MAX}
                step={TEMP_STEP}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                aria-label="Temperature"
                className="h-1 w-20 cursor-pointer accent-[var(--color-iris)]"
              />
              <span className="w-7 text-right font-mono text-xs text-fg">{temperature.toFixed(1)}</span>
            </div>

            {/* Send / Stop */}
            <div className="ml-auto">
              {isStreaming ? (
                <button
                  onClick={onStop}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-sm font-medium text-fg transition hover:border-rose-500/50 hover:text-rose-200"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={sendDisabled}
                  className="btn-primary flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition"
                >
                  <Send className="h-4 w-4" />
                  Send
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-2 px-1 text-center text-[11px] text-muted/60">
          IrisUI runs entirely on your machine via Ollama · Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </div>
  )
}
