import { useRef, useState } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { deleteAllData, exportAll, importAll } from '../lib/backup'
import { download } from '../lib/exporters'
import { ConfirmDialog } from './ConfirmDialog'

export function SettingsData() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const exportData = async () => {
    setExporting(true)
    setExportError('')
    try {
      const backup = await exportAll()
      const date = new Date(backup.exportedAt).toISOString().slice(0, 10)
      download(`irisui-backup-${date}.json`, JSON.stringify(backup, null, 2), 'application/json')
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const importData = async (file: File) => {
    setImporting(true)
    setImportError('')
    try {
      const text = await file.text()
      const parsed: unknown = JSON.parse(text)
      await importAll(parsed)
      location.reload()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed')
      setImporting(false)
    }
  }

  const confirmDeleteAll = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteAllData()
      location.reload()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Backup</h3>
        <p className="mb-3 text-xs text-muted">
          Everything IrisUI stores — chats, stats, knowledge bases, personas, prompts, and settings —
          lives only on this device. Export it to a single JSON file, or restore from one.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void exportData()}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-fg transition hover:border-iris/40 disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Exporting…' : 'Export all data'}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-fg transition hover:border-iris/40 disabled:opacity-60"
          >
            <Upload className="h-3.5 w-3.5" />
            {importing ? 'Importing…' : 'Import backup'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importData(file)
            }}
          />
        </div>
        {exportError && <p className="mt-2 text-xs text-rose-300">⚠️ {exportError}</p>}
        {importError && <p className="mt-2 text-xs text-rose-300">⚠️ {importError}</p>}
      </section>

      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-rose-300">
          Danger zone
        </h3>
        <p className="mb-3 text-xs text-muted">
          Permanently delete every chat, knowledge base, persona, prompt, stat, and setting stored on
          this device. This can't be undone.
        </p>
        <button
          onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-medium text-rose-300 transition hover:border-rose-500/70 hover:bg-rose-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete all data
        </button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        danger
        busy={deleting}
        error={deleteError}
        title="Delete all data?"
        message="This removes every chat, knowledge base, persona, prompt, stat, and setting stored on this device. This can't be undone."
        confirmLabel="Delete everything"
        onConfirm={() => void confirmDeleteAll()}
        onCancel={() => {
          if (deleting) return
          setConfirmDelete(false)
          setDeleteError('')
        }}
      />
    </div>
  )
}
