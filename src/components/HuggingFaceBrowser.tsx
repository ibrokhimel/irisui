import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Heart, Loader2, Search, X } from 'lucide-react'
import type { HFModel } from '../lib/huggingface'
import { fetchHuggingFaceNext, searchHuggingFace } from '../lib/huggingface'
import { formatCount } from '../lib/format'

/** Live Hugging Face GGUF search with infinite scroll. Installs via `ollama pull hf.co/<repo>`. */
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
  const [models, setModels] = useState<HFModel[]>([])
  const [nextUrl, setNextUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const genRef = useRef(0) // guards against stale appends after a new search

  // New search (debounced). Bumps the generation so in-flight loads are ignored.
  useEffect(() => {
    const gen = ++genRef.current
    const controller = new AbortController()
    const t = setTimeout(
      async () => {
        setLoading(true)
        setError('')
        try {
          const page = await searchHuggingFace(query, controller.signal)
          if (genRef.current !== gen) return
          setModels(page.models)
          setNextUrl(page.nextUrl)
        } catch (e) {
          if (genRef.current === gen && !(e instanceof Error && e.name === 'AbortError')) {
            setError("Couldn't reach Hugging Face. Check your connection and try again.")
            setModels([])
            setNextUrl(null)
          }
        } finally {
          if (genRef.current === gen) setLoading(false)
        }
      },
      query.trim() ? 350 : 0,
    )
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [query])

  const loadMore = useCallback(async () => {
    if (!nextUrl || loadingMore) return
    const gen = genRef.current
    setLoadingMore(true)
    try {
      const page = await fetchHuggingFaceNext(nextUrl)
      if (genRef.current !== gen) return
      setModels((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...prev, ...page.models.filter((m) => !seen.has(m.id))]
      })
      setNextUrl(page.nextUrl)
    } catch {
      /* keep what we have; user can scroll again to retry */
    } finally {
      if (genRef.current === gen) setLoadingMore(false)
    }
  }, [nextUrl, loadingMore])

  // Load more when the sentinel scrolls into view.
  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { root, rootMargin: '120px' },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [loadMore])

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
      ) : !loading && models.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel/40 px-4 py-6 text-center text-sm text-muted">
          No GGUF models found. Try another search.
        </div>
      ) : (
        <div ref={scrollRef} className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {models.map((m) => {
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

          {/* Infinite-scroll sentinel + end/loading indicator */}
          <div ref={sentinelRef} className="py-2 text-center text-xs text-muted">
            {loadingMore ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading more…
              </span>
            ) : nextUrl ? (
              ''
            ) : (
              models.length > 0 && 'End of results'
            )}
          </div>
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
