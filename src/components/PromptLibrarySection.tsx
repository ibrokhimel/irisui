import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Plus, Trash2, Wand2, X } from 'lucide-react'
import { SPRING } from '../lib/motion'
import { snippet } from '../lib/ragContext'
import type { PromptItem } from '../lib/studioStore'
import { createPrompt, deletePrompt } from '../lib/studioStore'

export function PromptLibrarySection({
  prompts,
  onChanged,
  onUsePrompt,
}: {
  prompts: PromptItem[]
  onChanged: () => void | Promise<void>
  onUsePrompt: (text: string) => void
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const valid = title.trim().length > 0 && text.trim().length > 0

  const create = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await createPrompt(title.trim(), text.trim())
      setTitle('')
      setText('')
      setFormOpen(false)
      await onChanged()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    await deletePrompt(id)
    await onChanged()
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">
          Prompt Library
          {prompts.length > 0 && <span className="text-muted"> ({prompts.length})</span>}
        </h2>
        <button
          onClick={() => setFormOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition hover:border-iris/40 hover:text-fg"
        >
          <Plus className="h-3.5 w-3.5" />
          New prompt
        </button>
      </div>

      <AnimatePresence initial={false}>
        {formOpen && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="mb-3 overflow-hidden"
          >
            <div className="rounded-2xl border border-line bg-panel/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-fg">New prompt</h3>
                <button
                  onClick={() => setFormOpen(false)}
                  aria-label="Cancel"
                  className="rounded-md p-1 text-muted hover:text-fg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title, e.g. Bug report template"
                className="w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg outline-none transition focus:border-iris/50"
              />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Prompt text…"
                rows={3}
                className="mt-2 w-full resize-none rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg outline-none transition focus:border-iris/50"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-line px-3.5 py-2 text-sm text-fg transition hover:bg-panel2"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void create()}
                  disabled={!valid || saving}
                  className="btn-primary rounded-lg px-3.5 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Create prompt'}
                </button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {prompts.length === 0 && !formOpen ? (
        <div className="rounded-xl border border-line bg-panel/40 px-4 py-8 text-center text-sm text-muted">
          No prompts yet. Create one to reuse it any time from the composer.
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {prompts.map((p) => (
              <m.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={SPRING}
                className="flex items-center gap-3 rounded-xl border border-line bg-panel2/50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-fg">{p.title}</div>
                  <p className="truncate text-xs text-muted">{snippet(p.text, 100)}</p>
                </div>
                <button
                  onClick={() => onUsePrompt(p.text)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-fg transition hover:border-iris/40 hover:bg-panel"
                >
                  <Wand2 className="h-3.5 w-3.5 text-iris" />
                  Use
                </button>
                <button
                  onClick={() => void remove(p.id)}
                  aria-label="Delete prompt"
                  className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}
