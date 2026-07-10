/**
 * Live model discovery via the public Hugging Face API. We query GGUF models
 * (the format Ollama can run), which the user can install directly with
 * `ollama pull hf.co/<repo>`. In dev the request goes through the Vite `/hf`
 * proxy so it is same-origin (no CORS).
 */
export interface HFModel {
  id: string
  downloads: number
  likes: number
}

const HF_BASE = import.meta.env.DEV ? '/hf' : 'https://huggingface.co'

export async function searchHuggingFace(query: string, signal?: AbortSignal): Promise<HFModel[]> {
  const params = new URLSearchParams({
    filter: 'gguf',
    sort: 'downloads',
    direction: '-1',
    limit: '25',
  })
  const q = query.trim()
  if (q) params.set('search', q)

  const res = await fetch(`${HF_BASE}/api/models?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Hugging Face responded with ${res.status}`)

  const data: unknown = await res.json()
  if (!Array.isArray(data)) return []

  return data
    .map((item) => {
      const o = item as Record<string, unknown>
      return {
        id: typeof o.id === 'string' ? o.id : '',
        downloads: typeof o.downloads === 'number' ? o.downloads : 0,
        likes: typeof o.likes === 'number' ? o.likes : 0,
      }
    })
    .filter((m) => m.id)
}
