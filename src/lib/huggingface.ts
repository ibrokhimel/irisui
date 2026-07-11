/**
 * Live model discovery via the public Hugging Face API. We query GGUF models
 * (the format Ollama can run), which the user can install directly with
 * `ollama pull hf.co/<repo>`. Requests go out through appFetch, which in the
 * desktop shell issues them from Rust — no browser origin, so CORS never
 * applies and huggingface.co can be hit directly.
 *
 * HF paginates with a cursor in the `Link: rel="next"` response header; we
 * follow that to load more results as the user scrolls.
 */
import { appFetch } from './http'

export interface HFModel {
  id: string
  downloads: number
  likes: number
}

export interface HFPage {
  models: HFModel[]
  nextUrl: string | null
}

const HF_BASE = 'https://huggingface.co'

function buildSearchUrl(query: string): string {
  const params = new URLSearchParams({
    filter: 'gguf',
    sort: 'downloads',
    direction: '-1',
    limit: '25',
  })
  const q = query.trim()
  if (q) params.set('search', q)
  return `${HF_BASE}/api/models?${params.toString()}`
}

function parseNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null
  for (const part of linkHeader.split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/)
    if (m) return m[1]
  }
  return null
}

async function fetchPage(url: string, signal?: AbortSignal): Promise<HFPage> {
  const res = await appFetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Hugging Face responded with ${res.status}`)

  const data: unknown = await res.json()
  const models = Array.isArray(data)
    ? data
        .map((item) => {
          const o = item as Record<string, unknown>
          return {
            id: typeof o.id === 'string' ? o.id : '',
            downloads: typeof o.downloads === 'number' ? o.downloads : 0,
            likes: typeof o.likes === 'number' ? o.likes : 0,
          }
        })
        .filter((m) => m.id)
    : []

  return { models, nextUrl: parseNext(res.headers.get('Link')) }
}

/** First page of results for a query (empty query = trending). */
export function searchHuggingFace(query: string, signal?: AbortSignal): Promise<HFPage> {
  return fetchPage(buildSearchUrl(query), signal)
}

/** A subsequent page, from a `nextUrl` returned by a previous page. */
export function fetchHuggingFaceNext(url: string, signal?: AbortSignal): Promise<HFPage> {
  return fetchPage(url, signal)
}
