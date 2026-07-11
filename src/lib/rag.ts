/**
 * Pure RAG building blocks: text chunking and vector similarity/ranking.
 * No React, no I/O — persistence lives in kbStore.ts, embedding calls in ollama.ts.
 */

export interface Chunk {
  id: string
  kbId: string
  fileName: string
  index: number
  text: string
}

export const DEFAULT_EMBED_MODEL = 'all-minilm'

const DEFAULT_SIZE = 1500
const DEFAULT_OVERLAP = 200
/** A break point earlier than this fraction of the window is considered too
 *  small (would produce a tiny leading chunk), so we fall back to a later
 *  boundary or a hard cut instead. */
const MIN_BREAK_FRACTION = 0.3

/**
 * Split `text` into overlapping chunks of at most `size` characters. Prefers
 * breaking at a paragraph boundary (`\n\n`), then a sentence boundary
 * (`. `, `! `, `? `) within the current window, falling back to a hard cut.
 * Never returns empty strings; a text no longer than `size` is returned as
 * a single-element array.
 */
export function chunkText(text: string, opts?: { size?: number; overlap?: number }): string[] {
  // Clamp inputs at entry: size must be >= 1 (size <= 0 would never advance
  // `start`, looping forever), and overlap must be in [0, size - 1] (an
  // overlap >= size would walk `start` backwards or keep it stuck, dropping
  // characters between chunks instead of covering them).
  const size = Math.max(1, Math.floor(opts?.size ?? DEFAULT_SIZE))
  const overlap = Math.min(Math.max(0, Math.floor(opts?.overlap ?? DEFAULT_OVERLAP)), size - 1)
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.length <= size) return [trimmed]

  const minBreak = Math.floor(size * MIN_BREAK_FRACTION)
  const chunks: string[] = []
  let start = 0

  while (start < trimmed.length) {
    const hardEnd = Math.min(start + size, trimmed.length)
    const end = hardEnd >= trimmed.length ? hardEnd : findBreak(trimmed, start, hardEnd, minBreak)

    const piece = trimmed.slice(start, end).trim()
    if (piece) chunks.push(piece)

    if (end >= trimmed.length) break
    const next = end - overlap
    start = next > start ? next : end // guarantee forward progress
  }

  return chunks
}

/** Find the best chunk-end index in (start, hardEnd], preferring a paragraph
 *  break, then a sentence break, else the hard window edge. */
function findBreak(text: string, start: number, hardEnd: number, minBreak: number): number {
  const window = text.slice(start, hardEnd)

  const paraIdx = window.lastIndexOf('\n\n')
  if (paraIdx >= minBreak) return start + paraIdx

  const sentenceIdx = lastSentenceBreak(window, minBreak)
  if (sentenceIdx !== -1) return start + sentenceIdx

  return hardEnd
}

/** Index (relative to `window`) right after the last `[.!?]\s` occurrence
 *  at or beyond `minBreak`, or -1 if none qualifies. */
function lastSentenceBreak(window: string, minBreak: number): number {
  const re = /[.!?]\s/g
  let best = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(window))) {
    const cut = m.index + 1 // keep the punctuation, drop the trailing whitespace
    if (cut >= minBreak) best = cut
  }
  return best
}

/** Cosine similarity of two vectors; 0 if either has zero norm (or is empty). */
export function cosineSim(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Rank `items` by cosine similarity to `query`, descending, capped to `k`. */
export function topK(
  query: number[],
  items: { id: string; vector: number[] }[],
  k: number,
): { id: string; score: number }[] {
  return items
    .map((item) => ({ id: item.id, score: cosineSim(query, item.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, k))
}
