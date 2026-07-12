import { useEffect, useState } from 'react'
import { fetchKeyStatus, putKey, removeKey, type KeyStatus } from '../lib/providers/keys'
import { PRICES_AS_OF, loadPricing, savePriceOverride, type ModelPricing } from '../lib/providers/pricing'
import type { ProviderId } from '../lib/providers/modelRef'

const CLOUD: { id: ProviderId; name: string }[] = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
]

export function SettingsProviders() {
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [pricing, setPricing] = useState(() => loadPricing())

  useEffect(() => {
    void fetchKeyStatus().then(setKeys)
  }, [])

  const add = async (id: ProviderId) => {
    const key = (drafts[id] ?? '').trim()
    if (!key) return
    setError('')
    try {
      setKeys(await putKey(id, key))
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not save the ${id} key`)
    } finally {
      // Drop the key from component state the instant it is handed off — it lives
      // in the native store (packaged app) or the dev server, never in the page.
      setDrafts((d) => ({ ...d, [id]: '' }))
    }
  }

  const remove = async (id: ProviderId) => {
    setError('')
    try {
      setKeys(await removeKey(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not remove the ${id} key`)
    }
  }

  const savePrice = (ref: string, next: ModelPricing) => {
    savePriceOverride(ref, next)
    setPricing(loadPricing())
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
          Cloud API keys
        </h3>
        <p className="mb-3 text-xs text-muted">
          Keys are stored locally and never sent to the page — the packaged app keeps them in its
          native layer, and in development the local dev server holds them.
        </p>

        <div className="space-y-2.5">
          {CLOUD.map(({ id, name }) => {
            const existing = keys.find((k) => k.id === id)
            return (
              <div key={id} className="flex items-center gap-2.5">
                <span className="w-24 shrink-0 text-sm font-medium text-fg">{name}</span>
                {existing ? (
                  <>
                    <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                      {existing.suffix}
                    </code>
                    <button
                      onClick={() => void remove(id)}
                      className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted transition hover:border-rose-400/40 hover:text-rose-300"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={`${name} API key`}
                      value={drafts[id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void add(id)
                      }}
                      spellCheck={false}
                      aria-label={`${name} API key`}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg outline-none transition focus:border-iris/50"
                    />
                    <button
                      onClick={() => void add(id)}
                      className="btn-primary shrink-0 rounded-lg px-3.5 py-2 text-xs font-medium shadow-sm"
                    >
                      Add
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="mt-2.5 text-xs text-rose-300">{error}</p>}
      </section>

      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Pricing</h3>
        <p className="mb-3 text-xs text-muted">
          USD per million tokens, as of {PRICES_AS_OF}. These are estimates you can correct —
          providers change their prices, and every cost shown in chat is approximate.
        </p>

        <div className="space-y-2">
          {Object.entries(pricing).map(([ref, p]) => (
            <div key={ref} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg/80">{ref}</span>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                in
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={p.inputPerMTok}
                  aria-label={`Input price per million tokens for ${ref}`}
                  onBlur={(e) => savePrice(ref, { ...p, inputPerMTok: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-line bg-panel2 px-2 py-1.5 text-right text-sm text-fg outline-none transition focus:border-iris/50"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                out
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={p.outputPerMTok}
                  aria-label={`Output price per million tokens for ${ref}`}
                  onBlur={(e) => savePrice(ref, { ...p, outputPerMTok: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-line bg-panel2 px-2 py-1.5 text-right text-sm text-fg outline-none transition focus:border-iris/50"
                />
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
