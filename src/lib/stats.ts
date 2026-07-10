import type { ChatStreamResult } from './ollama'

export interface GenerationStat {
  id: string               // crypto.randomUUID()
  conversationId: string
  model: string
  startedAt: number        // epoch ms
  ttftMs: number           // client-measured first-token latency
  totalMs: number          // client-measured wall time
  promptTokens: number
  completionTokens: number
  tokensPerSec: number     // eval_count / (eval_duration/1e9); wall-time fallback
  loadMs: number           // load_duration / 1e6
}

export interface MessageStat {
  model: string
  tokensPerSec: number
  ttftMs: number
  totalMs: number
  completionTokens: number
}

export interface ModelSummary {
  model: string; count: number
  avgTokensPerSec: number; avgTtftMs: number; avgTotalMs: number
  lastUsed: number
}

export function computeStat(input: {
  conversationId: string; model: string; startedAt: number
  ttftMs: number; totalMs: number; meta: ChatStreamResult
}): GenerationStat {
  const { meta } = input
  const evalSec = meta.evalDurationNs / 1e9
  const wallSec = input.totalMs / 1000
  const tokensPerSec =
    evalSec > 0 ? meta.completionTokens / evalSec
    : wallSec > 0 ? meta.completionTokens / wallSec
    : 0
  return {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    model: input.model,
    startedAt: input.startedAt,
    ttftMs: Math.round(input.ttftMs),
    totalMs: Math.round(input.totalMs),
    promptTokens: meta.promptTokens,
    completionTokens: meta.completionTokens,
    tokensPerSec,
    loadMs: Math.round(meta.loadDurationNs / 1e6),
  }
}

export function toMessageStat(stat: GenerationStat): MessageStat {
  return {
    model: stat.model, tokensPerSec: stat.tokensPerSec,
    ttftMs: stat.ttftMs, totalMs: stat.totalMs, completionTokens: stat.completionTokens,
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
  return [...groups.entries()]
    .map(([model, g]) => ({
      model, count: g.length,
      avgTokensPerSec: avg(g.map((s) => s.tokensPerSec)),
      avgTtftMs: avg(g.map((s) => s.ttftMs)),
      avgTotalMs: avg(g.map((s) => s.totalMs)),
      lastUsed: Math.max(...g.map((s) => s.startedAt)),
    }))
    .sort((a, b) => b.count - a.count)
}

export function formatStatLine(stat: MessageStat): string {
  return `${stat.model} · ${stat.tokensPerSec.toFixed(1)} tok/s · first token ${stat.ttftMs}ms · total ${(stat.totalMs / 1000).toFixed(1)}s`
}
