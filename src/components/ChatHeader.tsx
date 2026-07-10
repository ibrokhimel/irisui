import { ChevronDown, RefreshCw, Trash2 } from 'lucide-react'
import type { OllamaModel, OllamaStatus } from '../types'

const STATUS_META: Record<OllamaStatus, { label: string; dot: string; text: string }> = {
  checking: { label: 'Checking…', dot: 'bg-muted', text: 'text-muted' },
  online: { label: 'Ollama online', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  'no-models': { label: 'No models installed', dot: 'bg-amber-400', text: 'text-amber-300' },
  offline: { label: 'Ollama offline', dot: 'bg-rose-500', text: 'text-rose-300' },
}

export function ChatHeader({
  models,
  selectedModel,
  onSelectModel,
  status,
  isStreaming,
  hasMessages,
  onClear,
  onRefresh,
}: {
  models: OllamaModel[]
  selectedModel: string
  onSelectModel: (name: string) => void
  status: OllamaStatus
  isStreaming: boolean
  hasMessages: boolean
  onClear: () => void
  onRefresh: () => void
}) {
  const meta = STATUS_META[status]
  const modelDisabled = isStreaming || models.length === 0
  const showRefresh = status === 'offline' || status === 'no-models'

  return (
    <header className="flex items-center gap-3 border-b border-line bg-panel/50 px-4 py-3 backdrop-blur-sm">
      {/* Model selector */}
      <div className="relative">
        <select
          value={selectedModel}
          onChange={(e) => onSelectModel(e.target.value)}
          disabled={modelDisabled}
          aria-label="Selected model"
          className="w-full max-w-[240px] appearance-none truncate rounded-lg border border-line bg-panel2 py-2 pl-3 pr-9 text-sm font-medium text-fg outline-none transition hover:border-iris/40 disabled:cursor-not-allowed disabled:opacity-60"
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
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>

      {/* Connection status */}
      <div className={'flex items-center gap-2 text-sm ' + meta.text}>
        <span className="relative flex h-2 w-2">
          {status === 'online' && (
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-60" />
          )}
          <span className={'relative inline-flex h-2 w-2 rounded-full ' + meta.dot} />
        </span>
        <span className="hidden sm:inline">{meta.label}</span>
      </div>

      {showRefresh && (
        <button
          onClick={onRefresh}
          title="Re-check Ollama"
          aria-label="Re-check Ollama"
          className="rounded-lg border border-line bg-panel2 p-2 text-muted transition hover:border-iris/40 hover:text-fg"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      )}

      {/* Clear chat */}
      <button
        onClick={onClear}
        disabled={!hasMessages}
        className="ml-auto flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-muted transition hover:border-rose-500/40 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
      >
        <Trash2 className="h-4 w-4" />
        <span className="hidden sm:inline">Clear chat</span>
      </button>
    </header>
  )
}
