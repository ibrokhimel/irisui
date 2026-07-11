import { useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { BookOpen, Download, FileText, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { SPRING } from '../lib/motion'
import type { OllamaModel, OllamaStatus } from '../types'
import type { KnowledgeBase, StoredChunk } from '../lib/kbStore'
import { addChunks, createKb, deleteKb } from '../lib/kbStore'
import { DEFAULT_EMBED_MODEL, chunkText } from '../lib/rag'
import { embedTexts } from '../lib/ollama'
import { isModelInstalled } from '../lib/ragContext'
import type { ModelPull } from '../hooks/useModelPull'
import { ConfirmDialog } from './ConfirmDialog'

/** Embed uploaded chunks in batches to stay within Ollama's request limits. */
const EMBED_BATCH = 16
const ACCEPT = '.txt,.md,.json,.csv'

export function KnowledgePage({
  models,
  status,
  kbs,
  onChanged,
  pull,
}: {
  models: OllamaModel[]
  status: OllamaStatus
  kbs: KnowledgeBase[]
  onChanged: () => void | Promise<void>
  pull: ModelPull
}) {
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [toDelete, setToDelete] = useState<KnowledgeBase | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const embedReady = useMemo(
    () => isModelInstalled(models.map((m) => m.name), DEFAULT_EMBED_MODEL),
    [models],
  )

  const create = async () => {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      await createKb(name, DEFAULT_EMBED_MODEL)
      setNewName('')
      await onChanged()
    } catch {
      /* createKb only fails on an IndexedDB error — rare and non-fatal */
    } finally {
      setCreating(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteKb(toDelete.id)
      setToDelete(null)
      await onChanged()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <h1 className="mb-6 flex items-center gap-2 text-2xl font-semibold text-fg">
          <BookOpen className="h-6 w-6 text-iris" />
          Knowledge
        </h1>

        {/* Embedding-model gate */}
        {!embedReady && (
          <section className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <h2 className="mb-1 text-sm font-semibold text-fg">Embedding model required</h2>
            <p className="mb-3 text-sm text-muted">
              Knowledge bases index your files with{' '}
              <span className="font-mono text-fg">{DEFAULT_EMBED_MODEL}</span>. Install it once to
              start indexing and retrieving.
            </p>
            <button
              onClick={() => void pull.start(DEFAULT_EMBED_MODEL)}
              disabled={pull.pulling || status === 'offline'}
              className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {pull.pulling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {pull.pulling ? 'Installing…' : `Install ${DEFAULT_EMBED_MODEL} (~46 MB)`}
            </button>
            {pull.error && <p className="mt-3 text-sm text-rose-300">⚠️ {pull.error}</p>}
          </section>
        )}

        {/* Create */}
        <section className="mb-6 rounded-2xl border border-line bg-panel/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-fg">Create a knowledge base</h2>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create()
              }}
              placeholder="Name, e.g. Product docs"
              className="flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg outline-none transition focus:border-iris/50"
            />
            <button
              onClick={() => void create()}
              disabled={!newName.trim() || creating}
              className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Create
            </button>
          </div>
        </section>

        {/* List */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg">
            Your knowledge bases
            {kbs.length > 0 && <span className="text-muted"> ({kbs.length})</span>}
          </h2>
          {kbs.length === 0 ? (
            <Empty>
              No knowledge bases yet. Create one above, then add .txt, .md, .json, or .csv files to
              index them for chat.
            </Empty>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {kbs.map((kb) => (
                  <m.div
                    key={kb.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={SPRING}
                  >
                    <KbCard kb={kb} embedReady={embedReady} onChanged={onChanged} onDelete={setToDelete} />
                  </m.div>
                ))}
              </AnimatePresence>
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
        message="This permanently removes the knowledge base and all of its indexed chunks. This can't be undone."
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

interface IndexProgress {
  fileName: string
  done: number
  total: number
}

function KbCard({
  kb,
  embedReady,
  onChanged,
  onDelete,
}: {
  kb: KnowledgeBase
  embedReady: boolean
  onChanged: () => void | Promise<void>
  onDelete: (kb: KnowledgeBase) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<IndexProgress | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const onFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    setError('')
    setUploading(true)
    try {
      for (const file of files) {
        const text = await file.text()
        const pieces = chunkText(text)
        if (pieces.length === 0) continue
        setProgress({ fileName: file.name, done: 0, total: pieces.length })

        const stored: StoredChunk[] = []
        for (let i = 0; i < pieces.length; i += EMBED_BATCH) {
          const batch = pieces.slice(i, i + EMBED_BATCH)
          const vectors = await embedTexts(kb.embedModel, batch)
          batch.forEach((chunk, j) => {
            stored.push({
              id: crypto.randomUUID(),
              kbId: kb.id,
              fileName: file.name,
              index: i + j,
              text: chunk,
              vector: vectors[j],
            })
          })
          setProgress({
            fileName: file.name,
            done: Math.min(i + EMBED_BATCH, pieces.length),
            total: pieces.length,
          })
        }

        await addChunks(kb.id, file.name, stored)
        await onChanged()
      }
    } catch (e) {
      setError(indexErrorMessage(e))
    } finally {
      setProgress(null)
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="rounded-xl border border-line bg-panel2/50">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-panel">
          <BookOpen className="h-[18px] w-[18px] text-iris" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-fg">{kb.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
            <span>{kb.fileCount} {kb.fileCount === 1 ? 'file' : 'files'}</span>
            <span>·</span>
            <span>{kb.chunkCount} {kb.chunkCount === 1 ? 'chunk' : 'chunks'}</span>
            <span>·</span>
            <span>Created {formatCreated(kb.createdAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={(e) => void onFiles(e.target.files)}
            className="hidden"
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading || !embedReady}
            title={embedReady ? 'Upload files to index' : `Install ${DEFAULT_EMBED_MODEL} first`}
            className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-iris/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading ? 'Indexing…' : 'Add files'}
          </button>
          <button
            onClick={() => onDelete(kb)}
            aria-label="Delete knowledge base"
            className="rounded-lg p-1.5 text-muted transition hover:bg-rose-500/10 hover:text-rose-300"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {(progress || error) && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-line px-4 py-3">
              {progress && (
                <>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-muted">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{progress.fileName}</span>
                    </span>
                    <span className="shrink-0 text-fg">
                      {progress.done}/{progress.total} chunks
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel">
                    <div
                      className="h-full rounded-full bg-iris transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </>
              )}
              {error && <p className={progress ? 'mt-2 text-sm text-rose-300' : 'text-sm text-rose-300'}>⚠️ {error}</p>}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function indexErrorMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : 'Indexing failed'
  if (/not found|404|try pulling/i.test(detail)) {
    return `Embedding model "${DEFAULT_EMBED_MODEL}" isn't installed. Install it above, then try again.`
  }
  if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(detail)) {
    return "Couldn't reach Ollama. Make sure it's running, then try again."
  }
  return detail
}

function formatCreated(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel/40 px-4 py-8 text-center text-sm text-muted">
      {children}
    </div>
  )
}
