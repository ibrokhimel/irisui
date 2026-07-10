import { useMemo, useState, type ReactNode } from 'react'
import { Boxes, Download, RefreshCw, Search, X } from 'lucide-react'
import type { OllamaModel, OllamaStatus } from '../types'
import { deleteModel } from '../lib/ollama'
import type { ModelPull } from '../hooks/useModelPull'
import type { ModelPrefs } from '../lib/modelPrefs'
import type { ModelCategory } from '../lib/modelCatalog'
import { MODEL_CATALOG, MODEL_CATEGORIES } from '../lib/modelCatalog'
import { formatBytes, formatEta, formatSpeed } from '../lib/format'
import { loadHardwareProfile } from '../lib/hardware'
import { modelFit } from '../lib/recommend'
import { ModelRow } from './ModelRow'
import { HardwarePanel } from './HardwarePanel'
import { HuggingFaceBrowser } from './HuggingFaceBrowser'
import { ConfirmDialog } from './ConfirmDialog'

type Source = 'ollama' | 'hf'

export function ModelsPage({
  models,
  status,
  onRefresh,
  prefs,
  onSetDefault,
  onToggleFavorite,
  pull,
}: {
  models: OllamaModel[]
  status: OllamaStatus
  onRefresh: () => Promise<void> | void
  prefs: ModelPrefs
  onSetDefault: (name: string) => void
  onToggleFavorite: (name: string) => void
  pull: ModelPull
}) {
  const [pullName, setPullName] = useState('')
  const [installedSearch, setInstalledSearch] = useState('')
  const [source, setSource] = useState<Source>('ollama')
  const [browseSearch, setBrowseSearch] = useState('')
  const [browseCat, setBrowseCat] = useState<ModelCategory | 'All'>('All')
  const [toDelete, setToDelete] = useState<OllamaModel | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [ramGb, setRamGb] = useState<number | null>(() => loadHardwareProfile()?.ramGb ?? null)

  const installedNames = useMemo(() => new Set(models.map((m) => m.name)), [models])
  const isInstalled = (name: string) => {
    if (installedNames.has(name) || installedNames.has(`${name}:latest`)) return true
    const prefix = `${name}:`
    for (const n of installedNames) if (n.startsWith(prefix)) return true
    return false
  }

  const filtered = useMemo(() => {
    const q = installedSearch.trim().toLowerCase()
    const list = q ? models.filter((m) => m.name.toLowerCase().includes(q)) : models
    const fav = (n: string) => (prefs.favorites.includes(n) ? 1 : 0)
    return [...list].sort((a, b) => fav(b.name) - fav(a.name) || a.name.localeCompare(b.name))
  }, [models, installedSearch, prefs.favorites])

  const browseList = useMemo(() => {
    const q = browseSearch.trim().toLowerCase()
    return MODEL_CATALOG.filter(
      (m) =>
        (browseCat === 'All' || m.category === browseCat) &&
        (!q ||
          m.name.toLowerCase().includes(q) ||
          m.label.toLowerCase().includes(q) ||
          m.blurb.toLowerCase().includes(q)),
    )
  }, [browseSearch, browseCat])

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteModel(toDelete.name)
      if (prefs.defaultModel === toDelete.name) onSetDefault(toDelete.name)
      if (prefs.favorites.includes(toDelete.name)) onToggleFavorite(toDelete.name)
      setToDelete(null)
      await onRefresh()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const p = pull.progress
  const percent = p?.total && p.total > 0 ? Math.min(100, Math.round(((p.completed ?? 0) / p.total) * 100)) : null
  const etaSeconds = p?.total && pull.speed > 0 ? (p.total - (p.completed ?? 0)) / pull.speed : 0

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
                if (e.key === 'Enter' && pullName.trim()) {
                  void pull.start(pullName)
                  setPullName('')
                }
              }}
              placeholder="Any model name, e.g. llama3.1:8b or hf.co/user/repo"
              disabled={pull.pulling}
              className="flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg outline-none transition focus:border-iris/50 disabled:opacity-60"
            />
            {pull.pulling ? (
              <button
                onClick={pull.cancel}
                className="rounded-lg border border-line px-4 py-2 text-sm text-fg transition hover:border-rose-500/50 hover:text-rose-200"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={() => {
                  void pull.start(pullName)
                  setPullName('')
                }}
                disabled={!pullName.trim() || status === 'offline'}
                className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                Pull
              </button>
            )}
          </div>

          {p && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted">
                <span className="truncate">
                  {pull.target ? `${pull.target} · ` : ''}
                  {p.status}
                  {p.total ? ` · ${formatBytes(p.completed)} / ${formatBytes(p.total)}` : ''}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {pull.speed > 0 && <span>{formatSpeed(pull.speed)}</span>}
                  {etaSeconds > 0 && <span>{formatEta(etaSeconds)}</span>}
                  {percent !== null && <span className="text-fg">{percent}%</span>}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-panel2">
                <div
                  className={'h-full rounded-full bg-iris transition-all ' + (percent === null ? 'w-1/3 animate-pulse' : '')}
                  style={percent !== null ? { width: `${percent}%` } : undefined}
                />
              </div>
            </div>
          )}
          {pull.error && <p className="mt-3 text-sm text-rose-300">⚠️ {pull.error}</p>}
          {pull.done && <p className="mt-3 text-sm text-emerald-400">✓ Installed {pull.done}.</p>}
        </section>

        <HardwarePanel
          onPull={(n) => void pull.start(n)}
          pulling={pull.pulling}
          isInstalled={isInstalled}
          onProfileChange={(p) => setRamGb(p.ramGb)}
        />

        {/* Browse */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-fg">Browse models</h2>
            <div className="flex rounded-lg border border-line bg-panel2/60 p-0.5 text-xs">
              {(['ollama', 'hf'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={
                    'rounded-md px-3 py-1.5 font-medium transition ' +
                    (source === s ? 'bg-iris text-[var(--color-on-accent)]' : 'text-muted hover:text-fg')
                  }
                >
                  {s === 'ollama' ? 'Ollama Library' : 'Hugging Face'}
                </button>
              ))}
            </div>
          </div>

          {source === 'ollama' ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {(['All', ...MODEL_CATEGORIES] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setBrowseCat(cat)}
                      className={
                        'rounded-full border px-3 py-1 text-xs transition ' +
                        (browseCat === cat
                          ? 'border-iris bg-iris/10 text-fg'
                          : 'border-line text-muted hover:border-iris/40 hover:text-fg')
                      }
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-line bg-panel2/60 px-2.5 py-1.5 focus-within:border-iris/40">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <input
                    value={browseSearch}
                    onChange={(e) => setBrowseSearch(e.target.value)}
                    placeholder="Filter…"
                    className="w-28 bg-transparent text-sm text-fg outline-none placeholder:text-muted/70"
                  />
                  {browseSearch && (
                    <button onClick={() => setBrowseSearch('')} aria-label="Clear" className="shrink-0">
                      <X className="h-3.5 w-3.5 text-muted hover:text-fg" />
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-[340px] overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {browseList.map((cm) => {
                    const installed = isInstalled(cm.name)
                    return (
                      <div
                        key={cm.name}
                        className="flex items-center gap-3 rounded-xl border border-line bg-panel2/40 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-fg">{cm.label}</span>
                            <span className="shrink-0 text-[11px] text-muted">{cm.approxSize}</span>
                          </div>
                          <p className="truncate text-xs text-muted">{cm.blurb}</p>
                        </div>
                        {installed ? (
                          <span className="shrink-0 text-xs text-emerald-400">Installed</span>
                        ) : (
                          <button
                            onClick={() => void pull.start(cm.name)}
                            disabled={pull.pulling}
                            className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-iris/40 hover:text-fg disabled:opacity-50"
                          >
                            Pull
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                {browseList.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-muted">No catalog models match your search.</p>
                )}
              </div>
            </>
          ) : (
            <HuggingFaceBrowser onPull={(name) => void pull.start(name)} pulling={pull.pulling} isInstalled={isInstalled} />
          )}
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
                value={installedSearch}
                onChange={(e) => setInstalledSearch(e.target.value)}
                placeholder="Search installed…"
                className="w-36 bg-transparent text-sm text-fg outline-none placeholder:text-muted/70"
              />
              {installedSearch && (
                <button onClick={() => setInstalledSearch('')} aria-label="Clear search" className="shrink-0">
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
                  fit={ramGb && m.size ? modelFit(m.size, ramGb) : null}
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
