import { CTX_RESERVE_TOKENS, CTX_WARN_PCT } from '../constants'

/**
 * Refusing to overflow the context window.
 *
 * When a prompt exceeds num_ctx, llama.cpp does not error — it *context-shifts*:
 * it discards the oldest half of the KV cache and generates anyway. The reply
 * comes back looking perfectly normal, except the model has quietly forgotten
 * the start of the conversation and nothing in the response says so. Silent
 * amnesia is worse than a refusal, so we block the send instead.
 */

export type ContextVerdict = 'ok' | 'warn' | 'full'

/**
 * English averages roughly 4 characters per token. We divide by less, so we
 * OVER-estimate: under-estimating would wave through a request that then gets
 * silently truncated, which is the exact failure this module exists to prevent.
 * Erring high costs the user a little headroom; erring low costs them their
 * conversation's memory.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 3.6)
}

/**
 * Tokens the NEXT request will carry.
 *
 * The history's size is known exactly — Ollama reports prompt_eval_count and
 * eval_count for the last turn, and those tokens are all still in the
 * conversation. Only the new draft has to be estimated. The reserve keeps room
 * for the reply itself, since a prompt that only just fits leaves the answer
 * nowhere to go.
 */
export function projectContextUse(input: {
  lastPromptTokens?: number
  lastCompletionTokens?: number
  draft: string
  reserveTokens?: number
}): number {
  const history = Math.max(0, input.lastPromptTokens ?? 0) + Math.max(0, input.lastCompletionTokens ?? 0)
  const reserve = input.reserveTokens ?? CTX_RESERVE_TOKENS
  return history + estimateTokens(input.draft) + reserve
}

/**
 * A window of 0 means we haven't resolved one yet (the /api/show round-trip is
 * still in flight). Never block on an unknown limit — a spurious refusal is
 * worse than letting one request through.
 */
export function contextVerdict(projected: number, numCtx: number): ContextVerdict {
  if (numCtx <= 0) return 'ok'
  if (projected >= numCtx) return 'full'
  if (projected >= numCtx * CTX_WARN_PCT) return 'warn'
  return 'ok'
}

/**
 * Did Ollama actually truncate this turn? If it reports having evaluated a
 * prompt that fills the window, the history no longer fit and the reply was
 * generated against a mutilated conversation — so the reply itself is suspect
 * and the user deserves to know.
 */
export function wasTruncated(promptTokens: number, numCtx: number): boolean {
  if (numCtx <= 0 || promptTokens <= 0) return false
  return promptTokens >= numCtx
}
