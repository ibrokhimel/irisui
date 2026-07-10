import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Boxes, Download, RefreshCw, Search, X } from 'lucide-react'
import type { OllamaModel, OllamaStatus } from '../types'
import type { PullProgress } from '../lib/ollama'
import { deleteModel, pullModel } from '../lib/ollama'
import type { ModelPrefs } from '../lib/modelPrefs'
import { POPULAR_MODELS } from '../constants'
import { formatBytes } from '../lib/format'
import { ModelRow } from './ModelRow'
import { ConfirmDialog } from './ConfirmDialog'

export function ModelsPage({
  models,
  status,
  onRefresh,
  prefs,
  onSetDefault,
  onToggleFavorite,
}: {
  models: OllamaModel[]
  status: OllamaStatus
  onRefresh: () => Promise<void> | void
  prefs: ModelPrefs
  onSetDefault: (name: string) => void
  onToggleFavorite: (name: string) => void
}) {
  const [pullName, setPullName] = useState('')
  const [pulling, setPulling] = useState(false)
  const [progress, setProgress] = useState<PullProgress | null>(null)
  const [pullError, setPullError] = useState('')
  const [pullDone, setPullDone] = useState('')
  const pullAbort = useRef<AbortController | null>(null)

  const [search, setSearch] = useState('')
  const [toDelete, setToDelete] = useState<OllamaModel | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const installedNames = useMemo(() => new Set(models.map((m) => m.name)), [models])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? models.filter((m) => m.name.toLowerCase().includes(q)) : models
    const fav = (n: string) => (prefs.favorites.includes(n) ? 1 : 0)
    return [...list].sort((a, b) => fav(b.name) - fav(a.name) || a.name.localeCompare(b.name))
  }, [models, search, prefs.favorites])

  const startPull = async (name: string) => {
    const target = name.trim()
    if (!target || pulling) return
    setPulling(true)
    setProgress({ status: 'starting…' })
    setPullError('')
    setPullDone('')
    const controller = new AbortController()
    pullAbort.current = controller
    try {
      await pullModel({ name: target, signal: controller.signal, onProgress: setProgress })
      setProgress(null)
      setPullDone(target)
      setPullName('')
      await onRefresh()
    } catch (e) {
      setProgress(null)
      if (!(e instanceof Error && e.name === 'AbortError')) {
        setPullError(e instanceof Error ? e.message : 'Pull failed')
      }
    } finally {
      setPulling(false)
      pullAbort.current = null
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteModel(toDelete.name)
      if (prefs.defaultModel === toDelete.name) onSetDefault(toDelete.name) // toggles off
      if (prefs.favorites.includes(toDelete.name)) onToggleFavorite(toDelete.name)
      setToDelete(null)
      await onRefresh()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round(((progress.completed ?? 0) / progress.total) * 100))
      : null

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-fg">
            <Boxes className="h-6 w-6 text-iris" />
            Models
          </h1>
          <button
            onClick={() => onRefresh()}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:border-iris/40 hover:text-fg"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* Install */}
        <section className="mb-6 rounded-2xl border border-line bg-panel/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-fg">Install a model</h2>
          <div className="flex gap-2">
            <input
              value={pullName}
              onChange={(e) => setPullName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void startPull(pullName)
              }}
              placeholder="e.g. llama3.1:8b"
              disabled={pulling}
              className="flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg outline-none transition focus:border-iris/50 disabled:opacity-60"
            />
            {pulling ? (
              <button
                onClick={() => pullAbort.current?.abort()}
                className="rounded-lg border border-line px-4 py-2 text-sm text-fg transition hover:border-rose-500/50 hover:text-rose-200"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={() => void startPull(pullName)}
                disabled={!pullName.trim() || status === 'offline'}
                className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                Pull
              </button>
            )}
          </div>

          {progress && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted">
                <span className="truncate">
                  {progress.status}
                  {progress.total ? ` · ${formatBytes(progress.completed)} / ${formatBytes(progress.total)}` : ''}
                </span>
                {percent !== null && <span className="shrink-0">{percent}%</span>}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-panel2">
                <div
                  className={'h-full rounded-full bg-iris transition-all ' + (percent === null ? 'w-1/3 animate-pulse' : '')}
                  style={percent !== null ? { width: `${percent}%` } : undefined}
                />
              </div>
            </div>
          )}
          {pullError && <p className="mt-3 text-sm text-rose-300">⚠️ {pullError}</p>}
          {pullDone && <p className="mt-3 text-sm text-emerald-400">✓ Installed {pullDone}.</p>}
        </section>

        {/* Popular (simple library) */}
        <section className="mb-6">
          <h2 className="mb-1 text-sm font-semibold text-fg">Popular models</h2>
          <p className="mb-3 text-xs text-muted">One-click install of well-known models.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {POPULAR_MODELS.map((pm) => {
              const installed = installedNames.has(pm.name) || installedNames.has(`${pm.name}:latest`)
              return (
                <div
                  key={pm.name}
                  className="flex items-center gap-3 rounded-xl border border-line bg-panel2/40 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-fg">{pm.label}</span>
                      <span className="shrink-0 text-[11px] text-muted">{pm.approxSize}</span>
                    </div>
                    <p className="truncate text-xs text-muted">{pm.blurb}</p>
                  </div>
                  {installed ? (
                    <span className="shrink-0 text-xs text-emerald-400">Installed</span>
                  ) : (
                    <button
                      onClick={() => void startPull(pm.name)}
                      disabled={pulling}
                      className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-iris/40 hover:text-fg disabled:opacity-50"
                    >
                      Pull
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Installed */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-fg">
              Installed models{models.length > 0 && <span className="text-muted"> ({models.length})</span>}
            </h2>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-panel2/60 px-2.5 py-1.5 focus-within:border-iris/40">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search installed…"
                className="w-36 bg-transparent text-sm text-fg outline-none placeholder:text-muted/70"
              />
              {search && (
                <button onClick={() => setSearch('')} aria-label="Clear search" className="shrink-0">
                  <X className="h-3.5 w-3.5 text-muted hover:text-fg" />
                </button>
              )}
            </div>
          </div>

          {status === 'offline' ? (
            <Empty>Ollama is offline. Start it, then refresh.</Empty>
          ) : models.length === 0 ? (
            <Empty>No models installed yet. Pull one above to get started.</Empty>
          ) : filtered.length === 0 ? (
            <Empty>No installed models match your search.</Empty>
          ) : (
            <div className="space-y-2">
              {filtered.map((m) => (
                <ModelRow
                  key={m.name}
                  model={m}
                  isDefault={prefs.defaultModel === m.name}
                  isFavorite={prefs.favorites.includes(m.name)}
                  onToggleFavorite={onToggleFavorite}
                  onSetDefault={onSetDefault}
                  onDelete={setToDelete}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        danger
        busy={deleting}
        error={deleteError}
        title={`Delete ${toDelete?.name}?`}
        message="This will remove the model from your machine. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (deleting) return
          setToDelete(null)
          setDeleteError('')
        }}
      />
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel/40 px-4 py-8 text-center text-sm text-muted">
      {children}
    </div>
  )
}
