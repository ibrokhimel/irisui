import { computeCostUsd } from './providers/cost'
import type { ModelPricing } from './providers/pricing'
import { parseModelRef, type ProviderId } from './providers/modelRef'
import type { ChatUsage } from './providers/types'

export interface GenerationStat {
  id: string
  conversationId: string
  model: string             // qualified ref, e.g. 'openai:gpt-4o-mini'
  providerId?: ProviderId   // absent on stats persisted before multi-provider
  startedAt: number
  ttftMs: number
  totalMs: number
  promptTokens: number
  completionTokens: number
  tokensPerSec: number
  loadMs: number
  /** Absent when the model has no known price. NEVER 0 as a stand-in. */
  costUsd?: number
}

export interface MessageStat {
  model: string
  providerId?: ProviderId
  tokensPerSec: number
  ttftMs: number
  totalMs: number
  completionTokens: number
  /** Absent on messages persisted before context-window tracking shipped. */
  promptTokens?: number
  /** Absent when the model has no known price. */
  costUsd?: number
  /** The prompt filled the whole window, so Ollama context-shifted: this reply
   *  was generated against a conversation with its oldest turns dropped. */
  truncated?: boolean
}

export interface ModelSummary {
  model: string; count: number
  avgTokensPerSec: number; avgTtftMs: number; avgTotalMs: number
  lastUsed: number
  totalPromptTokens: number; totalCompletionTokens: number; avgPromptTokens: number
}

export function computeStat(input: {
  conversationId: string
  model: string
  startedAt: number
  usage: ChatUsage
  pricing?: ModelPricing
}): GenerationStat {
  const { usage } = input
  // Ollama reports its own eval duration; cloud providers report none, so they
  // fall through to wall-clock — the same fallback this function has always had.
  const evalSec = (usage.serverEvalNs ?? 0) / 1e9
  const wallSec = usage.totalMs / 1000
  const tokensPerSec =
    evalSec > 0 ? usage.completionTokens / evalSec
    : wallSec > 0 ? usage.completionTokens / wallSec
    : 0

  return {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    model: input.model,
    providerId: parseModelRef(input.model).providerId,
    startedAt: input.startedAt,
    ttftMs: Math.round(usage.ttftMs),
    totalMs: Math.round(usage.totalMs),
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    tokensPerSec,
    loadMs: Math.round((usage.loadDurationNs ?? 0) / 1e6),
    costUsd: computeCostUsd(usage, input.pricing),
  }
}

export function toMessageStat(stat: GenerationStat): MessageStat {
  return {
    model: stat.model, providerId: stat.providerId,
    tokensPerSec: stat.tokensPerSec,
    ttftMs: stat.ttftMs, totalMs: stat.totalMs, completionTokens: stat.completionTokens,
    promptTokens: stat.promptTokens, costUsd: stat.costUsd,
  }
}

export function summarizeByModel(stats: GenerationStat[]): ModelSummary[] {
  const groups = new Map<string, GenerationStat[]>()
  for (const s of stats) {
    const g = groups.get(s.model) ?? []
    g.push(s)
    groups.set(s.model, g)
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  return [...groups.entries()]
    .map(([model, g]) => ({
      model, count: g.length,
      avgTokensPerSec: avg(g.map((s) => s.tokensPerSec)),
      avgTtftMs: avg(g.map((s) => s.ttftMs)),
      avgTotalMs: avg(g.map((s) => s.totalMs)),
      lastUsed: Math.max(...g.map((s) => s.startedAt)),
      totalPromptTokens: sum(g.map((s) => s.promptTokens)),
      totalCompletionTokens: sum(g.map((s) => s.completionTokens)),
      avgPromptTokens: avg(g.map((s) => s.promptTokens)),
    }))
    .sort((a, b) => b.count - a.count)
}

export function formatStatLine(stat: MessageStat): string {
  // Display the bare model id: 'openai:gpt-4o-mini' reads as 'gpt-4o-mini'.
  // A legacy unprefixed ref parses back to itself, so old messages are unchanged.
  const { id } = parseModelRef(stat.model)
  let line = `${id} · ${stat.tokensPerSec.toFixed(1)} tok/s · first token ${stat.ttftMs}ms · total ${(stat.totalMs / 1000).toFixed(1)}s`
  if (stat.promptTokens !== undefined) {
    line += ` · ↑${stat.promptTokens.toLocaleString()} in · ↓${stat.completionTokens.toLocaleString()} out`
  }
  // "≈" because output pricing means the true cost is only knowable after the
  // fact, and an unpriced model shows nothing rather than a fabricated $0.00.
  if (stat.costUsd !== undefined) {
    line += ` · ≈ $${stat.costUsd.toFixed(4)}`
  }
  return line
}
