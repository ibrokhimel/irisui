import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { MessageCircle, Pencil, Plus, Trash2, UserRound, X } from 'lucide-react'
import { SPRING } from '../lib/motion'
import type { Effort, OllamaModel } from '../types'
import { DEFAULT_TEMPERATURE, EFFORT_OPTIONS, TEMP_MAX, TEMP_MIN, TEMP_STEP } from '../constants'
import { isLikelyEmbeddingModel } from '../lib/modelCatalog'
import { snippet } from '../lib/ragContext'
import type { Persona } from '../lib/studioStore'
import { createPersona, deletePersona, updatePersona } from '../lib/studioStore'
import { ConfirmDialog } from './ConfirmDialog'

type FormTarget = 'new' | Persona

export function PersonasSection({
  models,
  personas,
  onChanged,
  onChatWithPersona,
}: {
  models: OllamaModel[]
  personas: Persona[]
  onChanged: () => void | Promise<void>
  onChatWithPersona: (persona: Persona) => void
}) {
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null)
  const [toDelete, setToDelete] = useState<Persona | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const chatableModels = models.filter((m) => !isLikelyEmbeddingModel(m.name))

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deletePersona(toDelete.id)
      setToDelete(null)
      await onChanged()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">
          Personas
          {personas.length > 0 && <span className="text-muted"> ({personas.length})</span>}
        </h2>
        <button
          onClick={() => setFormTarget((t) => (t === 'new' ? null : 'new'))}
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition hover:border-iris/40 hover:text-fg"
        >
          <Plus className="h-3.5 w-3.5" />
          New persona
        </button>
      </div>

      <AnimatePresence initial={false}>
        {formTarget === 'new' && (
          <PersonaForm
            models={chatableModels}
            onCancel={() => setFormTarget(null)}
            onSubmit={async (input) => {
              await createPersona(input)
              setFormTarget(null)
              await onChanged()
            }}
          />
        )}
      </AnimatePresence>

      {personas.length === 0 && formTarget !== 'new' ? (
        <div className="rounded-xl border border-line bg-panel/40 px-4 py-8 text-center text-sm text-muted">
          No personas yet. Create one to give a chat a fixed system prompt and defaults.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {personas.map((p) => (
              <m.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={SPRING}
              >
                {formTarget !== 'new' && formTarget !== null && formTarget.id === p.id ? (
                  <PersonaForm
                    models={chatableModels}
                    initial={p}
                    onCancel={() => setFormTarget(null)}
                    onSubmit={async (input) => {
                      await updatePersona(p.id, input)
                      setFormTarget(null)
                      await onChanged()
                    }}
                  />
                ) : (
                  <PersonaCard
                    persona={p}
                    onEdit={() => setFormTarget(p)}
                    onDelete={() => setToDelete(p)}
                    onChat={() => onChatWithPersona(p)}
                  />
                )}
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        danger
        busy={deleting}
        error={deleteError}
        title={`Delete ${toDelete?.name}?`}
        message="This permanently removes the persona. Chats already using it keep their history but fall back to the effort preset."
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (deleting) return
          setToDelete(null)
          setDeleteError('')
        }}
      />
    </section>
  )
}

function PersonaCard({
  persona,
  onEdit,
  onDelete,
  onChat,
}: {
  persona: Persona
  onEdit: () => void
  onDelete: () => void
  onChat: () => void
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel2/50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-lg">
          {persona.icon || <UserRound className="h-[18px] w-[18px] text-iris" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-fg">{persona.name}</div>
          <p className="mt-0.5 truncate text-xs text-muted">{snippet(persona.systemPrompt, 90)}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onChat}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-fg transition hover:border-iris/40 hover:bg-panel"
        >
          <MessageCircle className="h-3.5 w-3.5 text-iris" />
          Chat
        </button>
        <button
          onClick={onEdit}
          aria-label="Edit persona"
          className="rounded-lg p-1.5 text-muted transition hover:bg-panel hover:text-fg"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete persona"
          className="rounded-lg p-1.5 text-muted transition hover:bg-rose-500/10 hover:text-rose-300"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function PersonaForm({
  models,
  initial,
  onCancel,
  onSubmit,
}: {
  models: OllamaModel[]
  initial?: Persona
  onCancel: () => void
  onSubmit: (input: {
    name: string
    icon: string
    systemPrompt: string
    defaultModel?: string
    defaultEffort: Effort
    defaultTemperature: number
  }) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '🤖')
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? '')
  const [defaultModel, setDefaultModel] = useState(initial?.defaultModel ?? '')
  const [effort, setEffort] = useState<Effort>(initial?.defaultEffort ?? 'balanced')
  const [temperature, setTemperature] = useState(initial?.defaultTemperature ?? DEFAULT_TEMPERATURE)
  const [saving, setSaving] = useState(false)

  const valid = name.trim().length > 0 && systemPrompt.trim().length > 0

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await onSubmit({
        name: name.trim(),
        icon: icon.trim() || '🤖',
        systemPrompt: systemPrompt.trim(),
        defaultModel: defaultModel || undefined,
        defaultEffort: effort,
        defaultTemperature: temperature,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <m.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="mb-3 overflow-hidden"
    >
      <div className="rounded-2xl border border-line bg-panel/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg">{initial ? 'Edit persona' : 'New persona'}</h3>
          <button onClick={onCancel} aria-label="Cancel" className="rounded-md p-1 text-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={8}
            aria-label="Icon (single emoji)"
            className="w-14 shrink-0 rounded-lg border border-line bg-panel2 px-2 py-2 text-center text-lg outline-none transition focus:border-iris/50"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Code Reviewer"
            className="flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg outline-none transition focus:border-iris/50"
          />
        </div>

        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="System prompt — how should this persona behave?"
          rows={3}
          className="mt-2 w-full resize-none rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg outline-none transition focus:border-iris/50"
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Default model
            </p>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="w-full rounded-lg border border-line bg-panel2 px-2 py-1.5 text-xs text-fg outline-none transition focus:border-iris/50"
            >
              <option value="">Current model</option>
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Effort</p>
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value as Effort)}
              className="w-full rounded-lg border border-line bg-panel2 px-2 py-1.5 text-xs text-fg outline-none transition focus:border-iris/50"
            >
              {EFFORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Temperature</p>
            <span className="font-mono text-xs text-fg">{temperature.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={TEMP_MIN}
            max={TEMP_MAX}
            step={TEMP_STEP}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            aria-label="Default temperature"
            className="h-1 w-full cursor-pointer accent-[var(--color-iris)]"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-line px-3.5 py-2 text-sm text-fg transition hover:bg-panel2"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!valid || saving}
            className="btn-primary rounded-lg px-3.5 py-2 text-sm font-medium disabled:opacity-60"
          >
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Create persona'}
          </button>
        </div>
      </div>
    </m.div>
  )
}
