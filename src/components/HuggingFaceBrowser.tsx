import { useEffect, useState } from 'react'
import { Download, Heart, Loader2, Search, X } from 'lucide-react'
import type { HFModel } from '../lib/huggingface'
import { searchHuggingFace } from '../lib/huggingface'
import { formatCount } from '../lib/format'

/** Live Hugging Face GGUF search. Results install via `ollama pull hf.co/<repo>`. */
export function HuggingFaceBrowser({
  onPull,
  pulling,
  isInstalled,
}: {
  onPull: (name: string) => void
  pulling: boolean
  isInstalled: (name: string) => boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HFModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const t = setTimeout(
      async () => {
        setLoading(true)
        setError('')
        try {
          setResults(await searchHuggingFace(query, controller.signal))
        } catch (e) {
          if (!(e instanceof Error && e.name === 'AbortError')) {
            setError("Couldn't reach Hugging Face. Check your connection and try again.")
          }
        } finally {
          setLoading(false)
        }
      },
      query.trim() ? 350 : 0,
    )
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [query])

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-panel2/60 px-2.5 py-2 focus-within:border-iris/40">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Hugging Face (GGUF models)…"
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted/70"
        />
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />
        ) : (
          query && (
            <button onClick={() => setQuery('')} aria-label="Clear search" className="shrink-0">
              <X className="h-3.5 w-3.5 text-muted hover:text-fg" />
            </button>
          )
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-line bg-panel/40 px-4 py-6 text-center text-sm text-rose-300">
          {error}
        </div>
      ) : !loading && results.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel/40 px-4 py-6 text-center text-sm text-muted">
          No GGUF models found. Try another search.
        </div>
      ) : (
        <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
          {results.map((m) => {
            const target = `hf.co/${m.id}`
            const installed = isInstalled(target)
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-panel2/40 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg">{m.id}</div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      {formatCount(m.downloads)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {formatCount(m.likes)}
                    </span>
                  </div>
                </div>
                {installed ? (
                  <span className="shrink-0 text-xs text-emerald-400">Installed</span>
                ) : (
                  <button
                    onClick={() => onPull(target)}
                    disabled={pulling}
                    title={`ollama pull ${target}`}
                    className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-iris/40 hover:text-fg disabled:opacity-50"
                  >
                    Pull
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-muted/70">
        Installs run via <code className="text-muted">ollama pull hf.co/&lt;repo&gt;</code>. If a repo has
        multiple quantizations, add a tag (e.g. <code className="text-muted">:Q4_K_M</code>) in “Install a
        model” above.
      </p>
    </div>
  )
}
