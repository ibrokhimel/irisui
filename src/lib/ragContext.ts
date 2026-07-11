import type { ChatSource } from '../types'

/**
 * Pure helpers for turning retrieved chunks into RAG chat context. The impure
 * orchestration (embedding, ranking, IndexedDB reads) lives in retrieve.ts;
 * everything here is deterministic and unit-tested.
 */

export interface RetrievedExcerpt {
  fileName: string
  text: string
}

const CONTEXT_HEADER =
  'Use the following source excerpts to answer. Cite sources inline as [1], [2] matching the excerpt numbers. If the excerpts are irrelevant, say so and answer from general knowledge.'

/**
 * Build the extra system message injected after the effort prompt: the citation
 * instructions followed by the numbered, full-text excerpts.
 */
export function buildContextMessage(excerpts: RetrievedExcerpt[]): string {
  const body = excerpts.map((e, i) => `[${i + 1}] (${e.fileName}) ${e.text}`).join('\n')
  return `${CONTEXT_HEADER}\n\n${body}`
}

const SNIPPET_MAX = 240

/** Collapse whitespace and cap `text` to `max` chars, adding an ellipsis. */
export function snippet(text: string, max = SNIPPET_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`
}

/** Build the persisted per-message source list (1-indexed, snippet-truncated). */
export function toSources(excerpts: RetrievedExcerpt[]): ChatSource[] {
  return excerpts.map((e, i) => ({ n: i + 1, fileName: e.fileName, snippet: snippet(e.text) }))
}

/**
 * True when `model` (e.g. 'all-minilm') matches any installed model name,
 * tolerating Ollama's implicit ':latest' tag in either direction and matching
 * a tagged variant (e.g. installed 'all-minilm:33m' matches 'all-minilm').
 */
export function isModelInstalled(installedNames: string[], model: string): boolean {
  if (!model) return false
  const bare = (n: string) => (n.endsWith(':latest') ? n.slice(0, -7) : n)
  const target = bare(model)
  return installedNames.some((raw) => {
    const n = bare(raw)
    return n === target || n.startsWith(`${target}:`)
  })
}
