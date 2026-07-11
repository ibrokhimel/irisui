import type { ChatSource } from '../types'
import { embedTexts } from './ollama'
import { getChunks, listKbs } from './kbStore'
import { topK } from './rag'
import { buildContextMessage, isModelInstalled, toSources } from './ragContext'

/**
 * Impure RAG retrieval: embed the query with the kb's embedding model, rank its
 * stored chunks, and assemble the context (system message + source list) from
 * the best matches. Composed from the pure helpers in ragContext.ts.
 */

const TOP_K = 6
const MIN_SCORE = 0.3

export interface RagContext {
  systemMessage: string
  sources: ChatSource[]
}

/**
 * - `context`       — usable context was retrieved
 * - `none`          — kb missing, empty, or nothing cleared the score threshold
 * - `embed-missing` — the kb's embedding model isn't installed in Ollama
 * - `error`         — embedding / storage failure (caller degrades silently)
 */
export type RetrieveResult =
  | ({ kind: 'context' } & RagContext)
  | { kind: 'none' }
  | { kind: 'embed-missing' }
  | { kind: 'error' }

export async function retrieveContext(
  kbId: string,
  query: string,
  installedModelNames: string[],
): Promise<RetrieveResult> {
  let embedModel: string
  try {
    const kb = (await listKbs()).find((k) => k.id === kbId)
    if (!kb) return { kind: 'none' }
    embedModel = kb.embedModel
  } catch {
    return { kind: 'error' }
  }

  if (!isModelInstalled(installedModelNames, embedModel)) return { kind: 'embed-missing' }

  try {
    const [queryVec] = await embedTexts(embedModel, [query])
    const chunks = await getChunks(kbId)
    if (chunks.length === 0) return { kind: 'none' }

    const ranked = topK(
      queryVec,
      chunks.map((c) => ({ id: c.id, vector: c.vector })),
      TOP_K,
    ).filter((r) => r.score > MIN_SCORE)
    if (ranked.length === 0) return { kind: 'none' }

    const byId = new Map(chunks.map((c) => [c.id, c]))
    const excerpts = ranked
      .map((r) => byId.get(r.id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ fileName: c.fileName, text: c.text }))

    return {
      kind: 'context',
      systemMessage: buildContextMessage(excerpts),
      sources: toSources(excerpts),
    }
  } catch {
    return { kind: 'error' }
  }
}
