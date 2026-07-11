# Multi-Provider Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user chat with any model from Ollama, OpenAI, or Anthropic through one interface, with API keys that never enter the browser and per-message cost recorded honestly.

**Architecture:** A narrow `ProviderAdapter` interface abstracts *chat only* — model management (pull/delete/benchmark) stays Ollama-specific and is untouched. All providers are reached through Vite dev-server proxies, so requests are same-origin and CORS never applies. A Vite plugin holds API keys on disk and injects auth headers server-side; the page sends a provider id and never sees a key.

**Tech Stack:** TypeScript (strict), React 18, Vite 7, Vitest 4 (node environment), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-12-multi-provider-design.md`

## Global Constraints

- Working directory: `C:\Users\User\Documents\irisui-multiprovider`, branch `feat/multi-provider`.
- TypeScript strict mode. `npm run build` runs `tsc` and must pass before any commit.
- Vitest runs in the **`node`** environment — there is no `localStorage`, no `fetch` DOM globals, and no `window`. Tests that need `localStorage` must use the in-memory mock pattern from `tests/lib/appSettings.test.ts`.
- Test files live in `tests/**/*.test.ts` (this is the vitest `include` glob). Never put tests in `src/`.
- Adapters are tested against **recorded fixtures, never the live network.** The suite must stay offline and fast.
- **A cost of "unknown" is `undefined`, never `0`.** No UI ever renders `$0.00` as a stand-in for an unknown price, and every cost is prefixed `≈`.
- **Never silently fall back to a different provider.** A failure surfaces as a failure.
- API keys must never appear in a response body, a log line, or the git index. `.keys.local.json` is gitignored.
- Run the full suite (`npm test`) before each commit, not just the new test.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/lib/providers/modelRef.ts` | Parse/format qualified model refs (`ollama:qwen2.5:0.5b`). Pure. |
| `src/lib/providers/pricing.ts` | Dated seed price table + user overrides. Data only. |
| `src/lib/providers/cost.ts` | `(usage, pricing) → costUsd \| undefined`. Pure. |
| `src/lib/providers/types.ts` | `ProviderAdapter`, `ChatUsage`, `ModelInfo`, `StreamChatParams`. |
| `src/lib/providers/sse.ts` | Shared Server-Sent-Events line reader (OpenAI + Anthropic). |
| `src/lib/providers/ollama.adapter.ts` | Wraps existing `lib/ollama.ts` in the adapter interface. |
| `src/lib/providers/openai.adapter.ts` | OpenAI chat-completions adapter. |
| `src/lib/providers/anthropic.adapter.ts` | Anthropic messages adapter. |
| `src/lib/providers/registry.ts` | `resolve(ref) → { adapter, modelId }`. |
| `src/lib/providers/keys.ts` | Browser-side client for the key-vault routes. Holds no key material. |
| `vite/keyStore.ts` | Server-side key persistence + masking + loopback guard. Pure-ish, testable. |
| `vite/providerProxyPlugin.ts` | Vite plugin: `/api/keys` routes + auth-injecting proxies. |

**Modify:**

| File | Change |
|---|---|
| `src/lib/stats.ts` | Consume `ChatUsage` instead of Ollama's `ChatStreamResult`; add `providerId`, `costUsd`. |
| `src/hooks/useChat.ts:3,211-240` | Call the registry instead of `lib/ollama`'s `streamChat`. |
| `src/hooks/useArena.ts` | Same. |
| `src/lib/modelPrefs.ts` | Store qualified refs; migrate legacy bare names on load. |
| `vite.config.ts` | Register the plugin; add `/openai` + `/anthropic` proxies. |
| `src/components/ChatInput.tsx` | Model picker grouped by provider. |
| `src/components/SettingsModal.tsx` | New "Providers" tab. |
| `.gitignore` | Add `.keys.local.json`. |

**Not touched (deliberately):** `ModelsPage.tsx`, `ModelRow.tsx`, `useModelPull.ts`, `huggingface.ts`. Model management is an Ollama-only concept.

**`store.ts` needs no migration.** `Conversation.model` holds a bare Ollama name on every
existing chat. Because `parseModelRef` reads an unprefixed ref as Ollama (Task 1), those
values keep resolving correctly with no data migration and no schema change; new chats
persist a qualified ref. This is the whole reason the parser falls back the way it does.

---

## Task 1: Qualified model refs

Everything downstream keys off a model ref, so this lands first.

**Files:**
- Create: `src/lib/providers/modelRef.ts`
- Test: `tests/lib/providers/modelRef.test.ts`

**Interfaces:**
- Produces: `type ProviderId = 'ollama' | 'openai' | 'anthropic'`; `PROVIDER_IDS: readonly ProviderId[]`; `parseModelRef(ref: string): { providerId: ProviderId; id: string }`; `formatModelRef(providerId: ProviderId, id: string): string`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/providers/modelRef.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatModelRef, parseModelRef } from '../../../src/lib/providers/modelRef'

describe('parseModelRef', () => {
  it('splits on the first colon only, because Ollama names contain colons', () => {
    expect(parseModelRef('ollama:qwen2.5:0.5b')).toEqual({ providerId: 'ollama', id: 'qwen2.5:0.5b' })
  })

  it('parses a cloud ref', () => {
    expect(parseModelRef('openai:gpt-4o-mini')).toEqual({ providerId: 'openai', id: 'gpt-4o-mini' })
  })

  it('treats an unprefixed ref as Ollama, so legacy persisted values keep working', () => {
    expect(parseModelRef('qwen2.5:0.5b')).toEqual({ providerId: 'ollama', id: 'qwen2.5:0.5b' })
    expect(parseModelRef('llama3.1')).toEqual({ providerId: 'ollama', id: 'llama3.1' })
  })

  it('does not mistake a model name for a provider prefix', () => {
    // 'sera' is not a provider, so the whole string is an Ollama model id
    expect(parseModelRef('sera:latest')).toEqual({ providerId: 'ollama', id: 'sera:latest' })
  })

  it('returns an empty id for an empty ref', () => {
    expect(parseModelRef('')).toEqual({ providerId: 'ollama', id: '' })
  })
})

describe('formatModelRef', () => {
  it('round-trips', () => {
    const ref = formatModelRef('ollama', 'qwen2.5:0.5b')
    expect(ref).toBe('ollama:qwen2.5:0.5b')
    expect(parseModelRef(ref)).toEqual({ providerId: 'ollama', id: 'qwen2.5:0.5b' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- modelRef`
Expected: FAIL — cannot resolve `src/lib/providers/modelRef`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/providers/modelRef.ts`:

```ts
/**
 * A model ref qualifies a model with the provider that serves it:
 * `ollama:qwen2.5:0.5b`, `openai:gpt-4o-mini`. Two providers can serve the same
 * model name, so a bare name is ambiguous once more than one provider exists.
 */
export type ProviderId = 'ollama' | 'openai' | 'anthropic'

export const PROVIDER_IDS: readonly ProviderId[] = ['ollama', 'openai', 'anthropic']

function isProviderId(v: string): v is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(v)
}

/**
 * Split on the FIRST colon only — Ollama model names contain colons of their own
 * ("qwen2.5:0.5b"), so a naive split(':') mangles them.
 *
 * A ref with no recognized provider prefix is Ollama: every value persisted
 * before this change is a bare Ollama name, so they stay valid without a
 * migration pass.
 */
export function parseModelRef(ref: string): { providerId: ProviderId; id: string } {
  const colon = ref.indexOf(':')
  if (colon > 0) {
    const head = ref.slice(0, colon)
    if (isProviderId(head)) return { providerId: head, id: ref.slice(colon + 1) }
  }
  return { providerId: 'ollama', id: ref }
}

export function formatModelRef(providerId: ProviderId, id: string): string {
  return `${providerId}:${id}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- modelRef`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/modelRef.ts tests/lib/providers/modelRef.test.ts
git commit -m "feat(providers): qualified model refs, split on the first colon only"
```

---

## Task 2: Pricing table and cost math

**Files:**
- Create: `src/lib/providers/pricing.ts`, `src/lib/providers/cost.ts`
- Test: `tests/lib/providers/cost.test.ts`

**Interfaces:**
- Consumes: `ProviderId` from Task 1.
- Produces: `interface ModelPricing { inputPerMTok: number; outputPerMTok: number }`; `PRICES_AS_OF: string`; `SEED_PRICING: Record<string, ModelPricing>`; `loadPricing(): Record<string, ModelPricing>`; `savePriceOverride(ref: string, p: ModelPricing): void`; `lookupPricing(ref: string): ModelPricing | undefined`; `computeCostUsd(usage, pricing?): number | undefined`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/providers/cost.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeCostUsd } from '../../../src/lib/providers/cost'

const pricing = { inputPerMTok: 2, outputPerMTok: 10 }

describe('computeCostUsd', () => {
  it('charges input and output at their separate rates', () => {
    // 1M input @ $2 + 1M output @ $10 = $12
    expect(computeCostUsd({ promptTokens: 1_000_000, completionTokens: 1_000_000 }, pricing)).toBeCloseTo(12)
  })

  it('scales to realistic token counts', () => {
    // 2000 in @ $2/M = $0.004 ; 500 out @ $10/M = $0.005 ; total $0.009
    expect(computeCostUsd({ promptTokens: 2000, completionTokens: 500 }, pricing)).toBeCloseTo(0.009)
  })

  it('returns undefined — NOT 0 — when pricing is unknown', () => {
    // A local Ollama model has no price. Rendering "$0.00" would be a lie:
    // it asserts the call was free-of-charge rather than not-priced.
    expect(computeCostUsd({ promptTokens: 2000, completionTokens: 500 }, undefined)).toBeUndefined()
  })

  it('returns 0 only when there genuinely were no tokens', () => {
    expect(computeCostUsd({ promptTokens: 0, completionTokens: 0 }, pricing)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- cost`
Expected: FAIL — cannot resolve `src/lib/providers/cost`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/providers/cost.ts`:

```ts
import type { ModelPricing } from './pricing'

/**
 * Cost of one generation in USD, or undefined when the model's price is unknown.
 *
 * undefined and 0 are different facts: 0 means "no tokens were billed", while
 * undefined means "we do not know what this costs". Callers must render the
 * latter as no cost at all — never as $0.00.
 */
export function computeCostUsd(
  usage: { promptTokens: number; completionTokens: number },
  pricing: ModelPricing | undefined,
): number | undefined {
  if (!pricing) return undefined
  return (
    (usage.promptTokens / 1_000_000) * pricing.inputPerMTok +
    (usage.completionTokens / 1_000_000) * pricing.outputPerMTok
  )
}
```

Create `src/lib/providers/pricing.ts`:

```ts
/**
 * Model prices, in USD per million tokens.
 *
 * These are a DATED SEED, not ground truth. Providers change prices, and a cost
 * readout that silently shows a stale number is worse than one that shows none —
 * the user trusts the figure. So: the table carries the date it was written, the
 * user can override any entry in Settings, and every cost in the UI is an
 * estimate (prefixed "≈"). A model absent from this table has no price, and no
 * cost is shown for it.
 *
 * Ollama models are local: they have no per-token price and are deliberately
 * absent.
 */
export interface ModelPricing {
  inputPerMTok: number
  outputPerMTok: number
}

/** The date the seed prices below were recorded. Shown to the user in Settings. */
export const PRICES_AS_OF = '2026-07-12'

/** Keyed by qualified model ref. Verify against the provider's own pricing page. */
export const SEED_PRICING: Record<string, ModelPricing> = {
  'openai:gpt-4o': { inputPerMTok: 2.5, outputPerMTok: 10 },
  'openai:gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  'anthropic:claude-sonnet-4-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'anthropic:claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
}

const KEY = 'irisui.pricing'

/** User corrections, merged over the seed table. */
export function loadPricing(): Record<string, ModelPricing> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...SEED_PRICING }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const overrides: Record<string, ModelPricing> = {}
    for (const [ref, v] of Object.entries(parsed)) {
      const p = v as Partial<ModelPricing> | null
      if (
        p && typeof p.inputPerMTok === 'number' && Number.isFinite(p.inputPerMTok) &&
        typeof p.outputPerMTok === 'number' && Number.isFinite(p.outputPerMTok)
      ) {
        overrides[ref] = { inputPerMTok: p.inputPerMTok, outputPerMTok: p.outputPerMTok }
      }
    }
    return { ...SEED_PRICING, ...overrides }
  } catch {
    return { ...SEED_PRICING }
  }
}

export function savePriceOverride(ref: string, pricing: ModelPricing): void {
  try {
    const raw = localStorage.getItem(KEY)
    const current = raw ? (JSON.parse(raw) as Record<string, ModelPricing>) : {}
    current[ref] = pricing
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** undefined when the model has no known price (e.g. any local Ollama model). */
export function lookupPricing(ref: string): ModelPricing | undefined {
  return loadPricing()[ref]
}
```

> **Note for the implementer:** the four seed prices above are placeholders that must be checked against each provider's public pricing page before this ships. They are wrong by default; the mechanism (dated, overridable, estimate-labelled) is what this task delivers, not the numbers.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- cost`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/pricing.ts src/lib/providers/cost.ts tests/lib/providers/cost.test.ts
git commit -m "feat(providers): dated price table and cost math; unknown price yields undefined, not zero"
```

---

## Task 3: Provider-neutral usage, and de-Ollama-ing stats

`lib/stats.ts` currently imports `ChatStreamResult` from `lib/ollama` — the one place Ollama leaks into the domain model. This task cuts that import.

**Files:**
- Create: `src/lib/providers/types.ts`
- Modify: `src/lib/stats.ts` (all of it)
- Modify: `tests/lib/stats.test.ts`

**Interfaces:**
- Consumes: `ProviderId`, `parseModelRef` (Task 1); `ModelPricing`, `computeCostUsd` (Task 2).
- Produces: `ChatUsage`, `ModelInfo`, `StreamChatParams`, `ProviderAdapter`; `computeStat({ conversationId, model, startedAt, usage, pricing? }): GenerationStat`; `GenerationStat`/`MessageStat` with `providerId?` and `costUsd?`.

- [ ] **Step 1: Write `src/lib/providers/types.ts`** (no test — it is types only)

```ts
import type { ProviderId } from './modelRef'
import type { ModelPricing } from './pricing'

/**
 * What a provider reports about one generation, plus client-measured timing.
 *
 * Only Ollama returns server-side eval/load durations; cloud providers report
 * token usage and nothing else. Those fields are therefore optional, and the
 * tokens/sec math falls back to wall-clock time when they are absent.
 */
export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  ttftMs: number            // measured by the adapter, every provider
  totalMs: number           // measured by the adapter, every provider
  serverEvalNs?: number     // Ollama's eval_duration
  loadDurationNs?: number   // Ollama's load_duration
}

export interface ModelInfo {
  ref: string               // qualified: 'openai:gpt-4o-mini'
  providerId: ProviderId
  id: string                // provider-native: 'gpt-4o-mini'
  label: string
  contextLength?: number    // absent when unknown
  pricing?: ModelPricing    // absent when unknown
}

export interface StreamChatParams {
  model: string             // provider-native id, NOT a qualified ref
  messages: { role: string; content: string }[]
  temperature: number
  signal: AbortSignal
  onToken: (delta: string) => void
  /** Provider-specific knobs (e.g. Ollama's num_ctx). Ignored by providers that
   *  do not understand them, so one provider's options never leak into another. */
  providerOptions?: Record<string, unknown>
}

export interface ProviderAdapter {
  id: ProviderId
  name: string
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  streamChat(p: StreamChatParams): Promise<ChatUsage>
  embed?(model: string, texts: string[]): Promise<number[][]>
}
```

- [ ] **Step 2: Write the failing test**

Replace the `meta` fixture and `computeStat` block at the top of `tests/lib/stats.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { computeStat, formatStatLine, summarizeByModel, toMessageStat } from '../../src/lib/stats'

const usage = {
  promptTokens: 20, completionTokens: 90,
  ttftMs: 620, totalMs: 8200,
  serverEvalNs: 3_000_000_000, loadDurationNs: 500_000_000,
}

describe('computeStat', () => {
  it('derives tokens/sec from Ollama server timing when present', () => {
    const s = computeStat({ conversationId: 'c1', model: 'ollama:m', startedAt: 1000, usage })
    expect(s.tokensPerSec).toBeCloseTo(30) // 90 tokens / 3s
    expect(s.loadMs).toBe(500)
    expect(s.ttftMs).toBe(620)
    expect(s.providerId).toBe('ollama')
  })

  it('falls back to wall time for a cloud provider, which reports no server timing', () => {
    const cloud = { promptTokens: 20, completionTokens: 90, ttftMs: 100, totalMs: 3000 }
    const s = computeStat({ conversationId: 'c1', model: 'openai:gpt-4o-mini', startedAt: 1000, usage: cloud })
    expect(s.tokensPerSec).toBeCloseTo(30) // 90 tokens / 3s wall
    expect(s.providerId).toBe('openai')
  })

  it('records cost when the model is priced', () => {
    const cloud = { promptTokens: 1_000_000, completionTokens: 1_000_000, ttftMs: 100, totalMs: 3000 }
    const s = computeStat({
      conversationId: 'c1', model: 'openai:gpt-4o-mini', startedAt: 1000, usage: cloud,
      pricing: { inputPerMTok: 2, outputPerMTok: 10 },
    })
    expect(s.costUsd).toBeCloseTo(12)
  })

  it('leaves cost undefined for an unpriced (local) model', () => {
    const s = computeStat({ conversationId: 'c1', model: 'ollama:m', startedAt: 1000, usage })
    expect(s.costUsd).toBeUndefined()
  })
})
```

Then append to the `formatStatLine` describe block:

```ts
  it('shows cost as an estimate, never as a bare figure', () => {
    const stat = {
      model: 'openai:gpt-4o-mini', tokensPerSec: 10, ttftMs: 100, totalMs: 1000,
      completionTokens: 50, promptTokens: 20, providerId: 'openai' as const, costUsd: 0.0042,
    }
    expect(formatStatLine(stat)).toContain('≈ $0.0042')
    expect(formatStatLine(stat)).toContain('gpt-4o-mini')   // bare id, not the qualified ref
  })

  it('shows no cost segment at all when cost is unknown', () => {
    const stat = { model: 'ollama:m', tokensPerSec: 10, ttftMs: 100, totalMs: 1000, completionTokens: 50 }
    expect(formatStatLine(stat)).not.toContain('$')
  })
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- stats`
Expected: FAIL — `computeStat` does not accept `usage`; `providerId`/`costUsd` do not exist.

- [ ] **Step 4: Rewrite `src/lib/stats.ts`**

```ts
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
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. `tests/lib/stats.test.ts` is green; nothing else regresses.

If `statsStore.test.ts` fails on the changed `GenerationStat` shape, update its fixtures to the `usage` form — do not weaken the type.

- [ ] **Step 6: Type-check**

Run: `npm run build`
Expected: `tsc` passes. `useChat.ts` / `useArena.ts` will still be calling the old `computeStat` signature — **that is expected**; fix them here by passing `usage` through from the existing `meta` object and the timings they already measure. Task 6 replaces the call entirely.

- [ ] **Step 7: Commit**

```bash
git add src/lib/providers/types.ts src/lib/stats.ts tests/lib/stats.test.ts
git commit -m "refactor(stats): consume provider-neutral ChatUsage; record providerId and cost"
```

---

## Task 4: The key store (server-side, pure)

The security-critical unit. Written and tested in isolation before it is wired to Vite.

**Files:**
- Create: `vite/keyStore.ts`
- Test: `tests/vite/keyStore.test.ts`

**Interfaces:**
- Produces: `maskKey(key: string): string`; `isLoopbackHost(host: string | undefined): boolean`; `readKeys(file: string): Record<string, string>`; `writeKey(file, id, key): void`; `deleteKey(file, id): void`; `listKeys(file): { id: string; suffix: string }[]`

- [ ] **Step 1: Write the failing test**

Create `tests/vite/keyStore.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deleteKey, isLoopbackHost, listKeys, maskKey, readKeys, writeKey } from '../../vite/keyStore'

const dir = mkdtempSync(join(tmpdir(), 'irisui-keys-'))
const file = join(dir, 'keys.json')
afterEach(() => {
  if (existsSync(file)) rmSync(file)
})

describe('maskKey', () => {
  it('reveals only the last four characters', () => {
    expect(maskKey('sk-proj-abcdefghij1234')).toBe('…1234')
  })
  it('does not leak a short key by revealing all of it', () => {
    expect(maskKey('abc')).toBe('…')
  })
})

describe('listKeys', () => {
  it('NEVER returns key material — only the id and a masked suffix', () => {
    writeKey(file, 'openai', 'sk-proj-supersecret9999')
    const listed = listKeys(file)
    expect(listed).toEqual([{ id: 'openai', suffix: '…9999' }])
    // The security property, asserted directly: the secret cannot appear anywhere
    // in what we hand back to the browser.
    expect(JSON.stringify(listed)).not.toContain('supersecret')
    expect(JSON.stringify(listed)).not.toContain('sk-proj')
  })
})

describe('readKeys / writeKey / deleteKey', () => {
  it('round-trips a key', () => {
    writeKey(file, 'openai', 'sk-1')
    expect(readKeys(file).openai).toBe('sk-1')
  })
  it('keeps providers independent', () => {
    writeKey(file, 'openai', 'sk-1')
    writeKey(file, 'anthropic', 'sk-2')
    deleteKey(file, 'openai')
    expect(readKeys(file).openai).toBeUndefined()
    expect(readKeys(file).anthropic).toBe('sk-2')
  })
  it('returns empty when the file does not exist', () => {
    expect(readKeys(join(dir, 'nope.json'))).toEqual({})
  })
  it('returns empty rather than throwing on a corrupt file', () => {
    writeKey(file, 'openai', 'sk-1')
    require('node:fs').writeFileSync(file, '{ not json')
    expect(readKeys(file)).toEqual({})
  })
})

describe('isLoopbackHost', () => {
  it('accepts loopback binds', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost(undefined)).toBe(true) // vite's default bind is loopback
  })
  it('rejects a LAN-exposed bind, because that would expose the user\'s API keys', () => {
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
    expect(isLoopbackHost('192.168.1.20')).toBe(false)
    expect(isLoopbackHost('::')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- keyStore`
Expected: FAIL — cannot resolve `vite/keyStore`.

- [ ] **Step 3: Write the implementation**

Create `vite/keyStore.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Server-side API key storage for the dev server.
 *
 * Keys live here and ONLY here. They are never sent to the browser: the page
 * posts a key once, and from then on it can only learn that a key exists and
 * what its last four characters are. Nothing in this module returns key material
 * to a caller except readKeys(), which exists solely so the proxy can attach an
 * Authorization header server-side.
 */

/** Last four characters only — enough to recognize a key, useless to steal. */
export function maskKey(key: string): string {
  return key.length > 4 ? `…${key.slice(-4)}` : '…'
}

/**
 * Vite's default bind is loopback. If the server is bound to anything else
 * (`vite --host`), every machine on the network could spend the user's money
 * through our authenticated proxies — so the key routes refuse to serve.
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (host === undefined) return true // vite's default bind is loopback
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

export function readKeys(file: string): Record<string, string> {
  try {
    if (!existsSync(file)) return {}
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [id, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v) out[id] = v
    }
    return out
  } catch {
    return {}
  }
}

export function writeKey(file: string, id: string, key: string): void {
  const keys = readKeys(file)
  keys[id] = key
  // mode 0600: owner read/write only.
  writeFileSync(file, JSON.stringify(keys, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

export function deleteKey(file: string, id: string): void {
  const keys = readKeys(file)
  delete keys[id]
  writeFileSync(file, JSON.stringify(keys, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

/** What the browser is allowed to know: which providers have a key, and its suffix. */
export function listKeys(file: string): { id: string; suffix: string }[] {
  return Object.entries(readKeys(file)).map(([id, key]) => ({ id, suffix: maskKey(key) }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- keyStore`
Expected: PASS (9 tests).

- [ ] **Step 5: Gitignore the key file**

Append to `.gitignore`:

```
# Local API keys held by the dev server. Never commit.
.keys.local.json
```

- [ ] **Step 6: Commit**

```bash
git add vite/keyStore.ts tests/vite/keyStore.test.ts .gitignore
git commit -m "feat(keys): server-side key store; list never returns key material"
```

---

## Task 5: The Vite plugin — key routes and auth-injecting proxies

**Files:**
- Create: `vite/providerProxyPlugin.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `vite/keyStore.ts` (Task 4).
- Produces: `providerProxyPlugin(): Plugin`; HTTP routes `GET/POST/DELETE /api/keys/:id`; proxy prefixes `/openai`, `/anthropic`.

- [ ] **Step 1: Write the plugin**

Create `vite/providerProxyPlugin.ts`:

```ts
import type { Plugin, ViteDevServer } from 'vite'
import { deleteKey, isLoopbackHost, listKeys, readKeys, writeKey } from './keyStore'

const KEY_FILE = '.keys.local.json'

/** Where each provider's key goes on an outbound request. */
const AUTH: Record<string, (key: string) => Record<string, string>> = {
  openai: (key) => ({ Authorization: `Bearer ${key}` }),
  anthropic: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
}

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

/**
 * Holds the user's API keys server-side and injects them into proxied requests,
 * so the browser never sees a key. The page can create and delete keys, and can
 * ask which providers have one, but there is no route that returns key material.
 */
export function providerProxyPlugin(): Plugin {
  return {
    name: 'irisui-provider-proxy',

    configureServer(server: ViteDevServer) {
      // server.host may be `true` (meaning "bind to all interfaces"), a string,
      // or undefined (vite's loopback default). Anything that is not an explicit
      // loopback string is treated as exposed.
      const host = server.config.server.host
      const loopback = typeof host === 'string' ? isLoopbackHost(host) : host !== true

      server.middlewares.use('/api/keys', async (req, res) => {
        if (!loopback) {
          return json(res, 403, {
            error:
              'Refusing to serve API keys: the dev server is bound to a non-loopback address. ' +
              'Anyone on your network could spend your money. Restart without --host.',
          })
        }

        const id = (req.url ?? '/').replace(/^\//, '').split('?')[0]

        if (req.method === 'GET') {
          // Only ids and masked suffixes. Never key material.
          return json(res, 200, { keys: listKeys(KEY_FILE) })
        }

        if (req.method === 'POST' && id) {
          const body = JSON.parse((await readBody(req)) || '{}') as { key?: unknown }
          if (typeof body.key !== 'string' || !body.key.trim()) {
            return json(res, 400, { error: 'Missing key' })
          }
          writeKey(KEY_FILE, id, body.key.trim())
          // Echo back only whether it is present — never the key.
          return json(res, 200, { ok: true, keys: listKeys(KEY_FILE) })
        }

        if (req.method === 'DELETE' && id) {
          deleteKey(KEY_FILE, id)
          return json(res, 200, { ok: true, keys: listKeys(KEY_FILE) })
        }

        return json(res, 405, { error: 'Method not allowed' })
      })

      if (!loopback) {
        server.config.logger.warn(
          '[irisui] Dev server is bound to a non-loopback address. Cloud providers are ' +
            'disabled: serving API keys over the network would let anyone spend your money.',
        )
      }
    },
  }
}

/** Header injection for the proxy config in vite.config.ts. */
export function injectAuthHeaders(providerId: string) {
  return (proxyReq: { setHeader(k: string, v: string): void }) => {
    const key = readKeys(KEY_FILE)[providerId]
    if (!key) return
    for (const [h, v] of Object.entries(AUTH[providerId]?.(key) ?? {})) {
      proxyReq.setHeader(h, v)
    }
  }
}
```

- [ ] **Step 2: Wire it into `vite.config.ts`**

Replace the `server.proxy` block:

```ts
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { injectAuthHeaders, providerProxyPlugin } from './vite/providerProxyPlugin'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

// Every provider is reached through a proxy, so all requests are same-origin and
// CORS never applies — we do not depend on any provider's browser-origin policy.
// API keys are attached here, in Node (see vite/providerProxyPlugin.ts); they are
// never sent to the browser.
export default defineConfig({
  plugins: [react(), tailwindcss(), providerProxyPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      '/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, ''),
      },
      '/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai/, ''),
        configure: (proxy) => proxy.on('proxyReq', injectAuthHeaders('openai')),
      },
      '/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/anthropic/, ''),
        configure: (proxy) => proxy.on('proxyReq', injectAuthHeaders('anthropic')),
      },
      '/hf': {
        target: 'https://huggingface.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hf/, ''),
      },
    },
  },
})
```

- [ ] **Step 3: Verify manually**

```bash
npm run dev
# in another shell:
curl -s localhost:5173/api/keys
```

Expected: `{"keys":[]}`

```bash
curl -s -X POST localhost:5173/api/keys/openai -H 'Content-Type: application/json' -d '{"key":"sk-test-1234"}'
curl -s localhost:5173/api/keys
```

Expected: `{"keys":[{"id":"openai","suffix":"…1234"}]}` — **the key itself must not appear.** Confirm `.keys.local.json` exists and `git status` does **not** list it.

- [ ] **Step 4: Verify the loopback guard**

```bash
npm run dev -- --host
curl -s localhost:5173/api/keys
```

Expected: HTTP 403 with the refusal message, and a warning in the dev-server log.

- [ ] **Step 5: Type-check and commit**

```bash
npm run build
git add vite/providerProxyPlugin.ts vite.config.ts
git commit -m "feat(keys): vite plugin holds keys server-side and injects auth on proxied requests"
```

---

## Task 6: The Ollama adapter

Port the existing client to the interface. Behavior must not change.

**Files:**
- Create: `src/lib/providers/ollama.adapter.ts`
- Test: `tests/lib/providers/ollama.adapter.test.ts`

**Interfaces:**
- Consumes: `ProviderAdapter`, `ChatUsage`, `StreamChatParams`, `ModelInfo` (Task 3); `formatModelRef` (Task 1); existing `lib/ollama.ts`.
- Produces: `ollamaAdapter: ProviderAdapter`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/providers/ollama.adapter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { ollamaAdapter } from '../../../src/lib/providers/ollama.adapter'

/** Build a Response whose body streams the given chunks. */
function ndjsonResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(l))
      c.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('ollamaAdapter.streamChat', () => {
  it('forwards content deltas and reports usage from the done chunk', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjsonResponse([
      '{"message":{"content":"Hel"}}\n',
      '{"message":{"content":"lo"}}\n',
      '{"done":true,"prompt_eval_count":11,"eval_count":2,"eval_duration":1000000000,"load_duration":500000000}\n',
    ])))

    const tokens: string[] = []
    const usage = await ollamaAdapter.streamChat({
      model: 'qwen2.5:0.5b',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    })

    expect(tokens.join('')).toBe('Hello')
    expect(usage.promptTokens).toBe(11)
    expect(usage.completionTokens).toBe(2)
    expect(usage.serverEvalNs).toBe(1_000_000_000)
    expect(usage.loadDurationNs).toBe(500_000_000)
    expect(usage.totalMs).toBeGreaterThanOrEqual(0)
  })

  it('survives a malformed line without dropping the stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjsonResponse([
      '{"message":{"content":"a"}}\n',
      'not json at all\n',
      '{"message":{"content":"b"}}\n',
      '{"done":true,"eval_count":2,"prompt_eval_count":1}\n',
    ])))

    const tokens: string[] = []
    await ollamaAdapter.streamChat({
      model: 'm', messages: [], temperature: 0, signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    })
    expect(tokens.join('')).toBe('ab')
  })

  it('passes num_ctx through providerOptions', async () => {
    const fetchMock = vi.fn(async () => ndjsonResponse(['{"done":true,"eval_count":0,"prompt_eval_count":0}\n']))
    vi.stubGlobal('fetch', fetchMock)

    await ollamaAdapter.streamChat({
      model: 'm', messages: [], temperature: 0.5, signal: new AbortController().signal,
      onToken: () => {}, providerOptions: { num_ctx: 8192 },
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.options).toEqual({ temperature: 0.5, num_ctx: 8192 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ollama.adapter`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Write the implementation**

Create `src/lib/providers/ollama.adapter.ts`:

```ts
import { fetchModels, streamChat as ollamaStreamChat } from '../ollama'
import { formatModelRef } from './modelRef'
import type { ChatUsage, ModelInfo, ProviderAdapter, StreamChatParams } from './types'

/**
 * Ollama behind the common interface. This is a thin wrapper: lib/ollama.ts keeps
 * owning the wire format, and the Models page keeps calling it directly for pull,
 * delete, show, and benchmark — concepts no cloud provider has.
 */
export const ollamaAdapter: ProviderAdapter = {
  id: 'ollama',
  name: 'Ollama',

  async listModels(signal) {
    const models = await fetchModels(signal)
    return models.map<ModelInfo>((m) => ({
      ref: formatModelRef('ollama', m.name),
      providerId: 'ollama',
      id: m.name,
      label: m.name,
      // Local models have no per-token price; leaving pricing undefined is what
      // makes the UI show no cost rather than "$0.00".
    }))
  },

  async streamChat(p: StreamChatParams): Promise<ChatUsage> {
    const t0 = performance.now()
    let firstAt = 0

    const numCtx = p.providerOptions?.num_ctx
    const meta = await ollamaStreamChat({
      model: p.model,
      messages: p.messages,
      temperature: p.temperature,
      numCtx: typeof numCtx === 'number' ? numCtx : undefined,
      signal: p.signal,
      onToken: (t) => {
        if (!firstAt) firstAt = performance.now()
        p.onToken(t)
      },
    })

    return {
      promptTokens: meta.promptTokens,
      completionTokens: meta.completionTokens,
      ttftMs: firstAt ? firstAt - t0 : 0,
      totalMs: performance.now() - t0,
      serverEvalNs: meta.evalDurationNs || undefined,
      loadDurationNs: meta.loadDurationNs || undefined,
    }
  },
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- ollama.adapter`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/ollama.adapter.ts tests/lib/providers/ollama.adapter.test.ts
git commit -m "feat(providers): ollama adapter"
```

---

## Task 7: Shared SSE reader

OpenAI and Anthropic both stream Server-Sent Events. One reader, two adapters.

**Files:**
- Create: `src/lib/providers/sse.ts`
- Test: `tests/lib/providers/sse.test.ts`

**Interfaces:**
- Produces: `readSseStream(body: ReadableStream<Uint8Array>, onEvent: (data: string) => void): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/providers/sse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readSseStream } from '../../../src/lib/providers/sse'

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch))
      c.close()
    },
  })
}

describe('readSseStream', () => {
  it('yields the data payload of each event', async () => {
    const got: string[] = []
    await readSseStream(stream(['data: {"a":1}\n\n', 'data: {"a":2}\n\n']), (d) => got.push(d))
    expect(got).toEqual(['{"a":1}', '{"a":2}'])
  })

  it('reassembles an event split across chunk boundaries', async () => {
    const got: string[] = []
    await readSseStream(stream(['data: {"a"', ':1}\n\n']), (d) => got.push(d))
    expect(got).toEqual(['{"a":1}'])
  })

  it('skips the [DONE] sentinel and comment/blank lines', async () => {
    const got: string[] = []
    await readSseStream(stream([': ping\n\n', 'data: {"a":1}\n\n', 'data: [DONE]\n\n']), (d) => got.push(d))
    expect(got).toEqual(['{"a":1}'])
  })

  it('ignores non-data fields such as event:', async () => {
    const got: string[] = []
    await readSseStream(stream(['event: message_start\ndata: {"t":"x"}\n\n']), (d) => got.push(d))
    expect(got).toEqual(['{"t":"x"}'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- sse`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Write the implementation**

Create `src/lib/providers/sse.ts`:

```ts
/**
 * Read a Server-Sent Events stream and hand each event's `data:` payload to
 * onEvent. Used by both cloud adapters.
 *
 * Deliberately forgiving in the same way lib/ollama.ts's NDJSON reader is: a
 * comment, a blank line, an unknown field, or the [DONE] sentinel is skipped
 * rather than treated as a failure. A partial event at a chunk boundary is
 * buffered until the rest arrives.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (data: string) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trimEnd()
        buffer = buffer.slice(nl + 1)
        if (!line || line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        onEvent(data)
      }
    }
  } finally {
    reader.releaseLock()
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- sse`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/sse.ts tests/lib/providers/sse.test.ts
git commit -m "feat(providers): shared SSE reader"
```

---

## Task 8: The OpenAI adapter

**Files:**
- Create: `src/lib/providers/openai.adapter.ts`
- Test: `tests/lib/providers/openai.adapter.test.ts`

**Interfaces:**
- Consumes: `readSseStream` (Task 7), `ProviderAdapter`/`ChatUsage` (Task 3), `formatModelRef` (Task 1), `lookupPricing` (Task 2).
- Produces: `openaiAdapter: ProviderAdapter`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/providers/openai.adapter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { openaiAdapter } from '../../../src/lib/providers/openai.adapter'

function sse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch))
      c.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('openaiAdapter.streamChat', () => {
  it('forwards delta content and reads usage from the final chunk', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":9,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ])))

    const tokens: string[] = []
    const usage = await openaiAdapter.streamChat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    })

    expect(tokens.join('')).toBe('Hello')
    expect(usage.promptTokens).toBe(9)
    expect(usage.completionTokens).toBe(2)
    expect(usage.serverEvalNs).toBeUndefined() // OpenAI reports no server timing
  })

  it('requests usage in the stream, since cost depends on it', async () => {
    const fetchMock = vi.fn(async () => sse(['data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)
    await openaiAdapter.streamChat({
      model: 'gpt-4o-mini', messages: [], temperature: 0,
      signal: new AbortController().signal, onToken: () => {},
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
  })

  it('surfaces the provider error message rather than a generic failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 },
    )))
    await expect(openaiAdapter.streamChat({
      model: 'gpt-4o-mini', messages: [], temperature: 0,
      signal: new AbortController().signal, onToken: () => {},
    })).rejects.toThrow('Incorrect API key provided')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- openai.adapter`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Write the implementation**

Create `src/lib/providers/openai.adapter.ts`:

```ts
import { formatModelRef } from './modelRef'
import { lookupPricing } from './pricing'
import { readSseStream } from './sse'
import type { ChatUsage, ModelInfo, ProviderAdapter, StreamChatParams } from './types'

/**
 * Requests go to /openai, the dev-server proxy, which attaches the API key in
 * Node. No key is present in this file, or anywhere else in the browser bundle.
 */
const BASE = '/openai'

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text()
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown } }
      if (typeof parsed.error?.message === 'string') return parsed.error.message
    } catch {
      if (text) return text.slice(0, 200)
    }
  } catch {
    /* ignore body read failures */
  }
  return `OpenAI responded with ${res.status}`
}

export const openaiAdapter: ProviderAdapter = {
  id: 'openai',
  name: 'OpenAI',

  async listModels(signal) {
    const res = await fetch(`${BASE}/v1/models`, { signal })
    if (!res.ok) throw new Error(await readError(res))
    const data = (await res.json()) as { data?: { id?: unknown }[] }
    return (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string')
      // Chat models only: the models endpoint also lists embeddings, TTS, and more.
      .filter((id) => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3'))
      .sort()
      .map<ModelInfo>((id) => ({
        ref: formatModelRef('openai', id),
        providerId: 'openai',
        id,
        label: id,
        pricing: lookupPricing(formatModelRef('openai', id)),
      }))
  },

  async streamChat(p: StreamChatParams): Promise<ChatUsage> {
    const t0 = performance.now()
    let firstAt = 0
    let promptTokens = 0
    let completionTokens = 0

    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: p.model,
        messages: p.messages,
        temperature: p.temperature,
        stream: true,
        // Without this the final chunk carries no usage, and we could not cost
        // the call from real numbers — only by guessing. We do not guess.
        stream_options: { include_usage: true },
      }),
      signal: p.signal,
    })

    if (!res.ok) throw new Error(await readError(res))
    if (!res.body) throw new Error('Streaming is not supported in this environment')

    await readSseStream(res.body, (data) => {
      let obj: {
        choices?: { delta?: { content?: unknown } }[]
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
      }
      try {
        obj = JSON.parse(data)
      } catch {
        return // a malformed frame must not kill the stream
      }
      const delta = obj.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) {
        if (!firstAt) firstAt = performance.now()
        p.onToken(delta)
      }
      if (typeof obj.usage?.prompt_tokens === 'number') promptTokens = obj.usage.prompt_tokens
      if (typeof obj.usage?.completion_tokens === 'number') completionTokens = obj.usage.completion_tokens
    })

    return {
      promptTokens,
      completionTokens,
      ttftMs: firstAt ? firstAt - t0 : 0,
      totalMs: performance.now() - t0,
      // No serverEvalNs / loadDurationNs: OpenAI reports no server-side timing,
      // so computeStat falls back to wall-clock tokens/sec.
    }
  },
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- openai.adapter`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/openai.adapter.ts tests/lib/providers/openai.adapter.test.ts
git commit -m "feat(providers): openai adapter"
```

---

## Task 9: The Anthropic adapter

Anthropic's stream is event-typed, not delta-shaped — this is the adapter that proves the interface is genuinely neutral rather than OpenAI-shaped.

**Files:**
- Create: `src/lib/providers/anthropic.adapter.ts`
- Test: `tests/lib/providers/anthropic.adapter.test.ts`

**Interfaces:**
- Consumes: same as Task 8.
- Produces: `anthropicAdapter: ProviderAdapter`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/providers/anthropic.adapter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { anthropicAdapter } from '../../../src/lib/providers/anthropic.adapter'

function sse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch))
      c.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('anthropicAdapter.streamChat', () => {
  it('accumulates text_delta events and reads usage from message_start/message_delta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      'data: {"type":"message_start","message":{"usage":{"input_tokens":14}}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
      'data: {"type":"message_delta","usage":{"output_tokens":2}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ])))

    const tokens: string[] = []
    const usage = await anthropicAdapter.streamChat({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    })

    expect(tokens.join('')).toBe('Hello')
    expect(usage.promptTokens).toBe(14)
    expect(usage.completionTokens).toBe(2)
  })

  it('hoists a system message into the top-level system field, as the API requires', async () => {
    const fetchMock = vi.fn(async () => sse(['data: {"type":"message_stop"}\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await anthropicAdapter.streamChat({
      model: 'claude-haiku-4-5',
      messages: [
        { role: 'system', content: 'You are terse.' },
        { role: 'user', content: 'hi' },
      ],
      temperature: 0.5,
      signal: new AbortController().signal,
      onToken: () => {},
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.system).toBe('You are terse.')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.max_tokens).toBeGreaterThan(0) // required by the API
  })

  it('ignores an unknown event type rather than failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      'data: {"type":"ping"}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ])))
    const tokens: string[] = []
    await anthropicAdapter.streamChat({
      model: 'm', messages: [], temperature: 0,
      signal: new AbortController().signal, onToken: (t) => tokens.push(t),
    })
    expect(tokens.join('')).toBe('x')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- anthropic.adapter`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Write the implementation**

Create `src/lib/providers/anthropic.adapter.ts`:

```ts
import { formatModelRef } from './modelRef'
import { lookupPricing } from './pricing'
import { readSseStream } from './sse'
import type { ChatUsage, ModelInfo, ProviderAdapter, StreamChatParams } from './types'

const BASE = '/anthropic'

/** The API requires max_tokens. This is a ceiling, not a target. */
const MAX_TOKENS = 4096

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text()
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown } }
      if (typeof parsed.error?.message === 'string') return parsed.error.message
    } catch {
      if (text) return text.slice(0, 200)
    }
  } catch {
    /* ignore body read failures */
  }
  return `Anthropic responded with ${res.status}`
}

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  name: 'Anthropic',

  async listModels(signal) {
    const res = await fetch(`${BASE}/v1/models`, { signal })
    if (!res.ok) throw new Error(await readError(res))
    const data = (await res.json()) as { data?: { id?: unknown; display_name?: unknown }[] }
    return (data.data ?? [])
      .filter((m): m is { id: string; display_name?: string } => typeof m.id === 'string')
      .map<ModelInfo>((m) => ({
        ref: formatModelRef('anthropic', m.id),
        providerId: 'anthropic',
        id: m.id,
        label: typeof m.display_name === 'string' ? m.display_name : m.id,
        pricing: lookupPricing(formatModelRef('anthropic', m.id)),
      }))
  },

  async streamChat(p: StreamChatParams): Promise<ChatUsage> {
    const t0 = performance.now()
    let firstAt = 0
    let promptTokens = 0
    let completionTokens = 0

    // Anthropic takes the system prompt as a top-level field, not as a message
    // with role "system". Hoist it; send the rest through unchanged.
    const system = p.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    const messages = p.messages.filter((m) => m.role !== 'system')

    const res = await fetch(`${BASE}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: p.model,
        messages,
        ...(system ? { system } : {}),
        temperature: p.temperature,
        max_tokens: MAX_TOKENS,
        stream: true,
      }),
      signal: p.signal,
    })

    if (!res.ok) throw new Error(await readError(res))
    if (!res.body) throw new Error('Streaming is not supported in this environment')

    await readSseStream(res.body, (data) => {
      let ev: {
        type?: unknown
        delta?: { type?: unknown; text?: unknown }
        message?: { usage?: { input_tokens?: unknown } }
        usage?: { output_tokens?: unknown }
      }
      try {
        ev = JSON.parse(data)
      } catch {
        return // a malformed frame must not kill the stream
      }

      // Anthropic's stream is event-typed rather than a flat delta feed; unknown
      // event types (ping, content_block_start, …) are simply not our business.
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        const text = ev.delta.text
        if (typeof text === 'string' && text) {
          if (!firstAt) firstAt = performance.now()
          p.onToken(text)
        }
      }
      if (ev.type === 'message_start' && typeof ev.message?.usage?.input_tokens === 'number') {
        promptTokens = ev.message.usage.input_tokens
      }
      if (ev.type === 'message_delta' && typeof ev.usage?.output_tokens === 'number') {
        completionTokens = ev.usage.output_tokens
      }
    })

    return {
      promptTokens,
      completionTokens,
      ttftMs: firstAt ? firstAt - t0 : 0,
      totalMs: performance.now() - t0,
    }
  },
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- anthropic.adapter`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/anthropic.adapter.ts tests/lib/providers/anthropic.adapter.test.ts
git commit -m "feat(providers): anthropic adapter"
```

---

## Task 10: The registry

**Files:**
- Create: `src/lib/providers/registry.ts`, `src/lib/providers/keys.ts`
- Test: `tests/lib/providers/registry.test.ts`

**Interfaces:**
- Consumes: all three adapters; `parseModelRef` (Task 1).
- Produces: `ADAPTERS: Record<ProviderId, ProviderAdapter>`; `resolve(ref): { adapter: ProviderAdapter; modelId: string }`; `listAllModels(configured: ProviderId[]): Promise<ModelInfo[]>`; and in `keys.ts`: `fetchKeyStatus(): Promise<KeyStatus[]>`, `putKey(id, key)`, `removeKey(id)`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/providers/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolve } from '../../../src/lib/providers/registry'

describe('resolve', () => {
  it('routes an Ollama ref to the Ollama adapter, keeping the colon-bearing id intact', () => {
    const { adapter, modelId } = resolve('ollama:qwen2.5:0.5b')
    expect(adapter.id).toBe('ollama')
    expect(modelId).toBe('qwen2.5:0.5b')
  })

  it('routes a cloud ref to its adapter', () => {
    expect(resolve('openai:gpt-4o-mini').adapter.id).toBe('openai')
    expect(resolve('anthropic:claude-haiku-4-5').adapter.id).toBe('anthropic')
  })

  it('routes a legacy unprefixed ref to Ollama', () => {
    const { adapter, modelId } = resolve('llama3.1:8b')
    expect(adapter.id).toBe('ollama')
    expect(modelId).toBe('llama3.1:8b')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- registry`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Write the implementations**

Create `src/lib/providers/registry.ts`:

```ts
import { anthropicAdapter } from './anthropic.adapter'
import { parseModelRef, type ProviderId } from './modelRef'
import { ollamaAdapter } from './ollama.adapter'
import { openaiAdapter } from './openai.adapter'
import type { ModelInfo, ProviderAdapter } from './types'

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  ollama: ollamaAdapter,
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
}

/** Route a qualified model ref to the adapter that serves it. */
export function resolve(ref: string): { adapter: ProviderAdapter; modelId: string } {
  const { providerId, id } = parseModelRef(ref)
  return { adapter: ADAPTERS[providerId], modelId: id }
}

/**
 * Models from every provider the user has configured. One provider being down
 * (Ollama not running, a rejected key) must not blank the whole picker, so each
 * provider's failure is contained to that provider.
 */
export async function listAllModels(configured: ProviderId[]): Promise<ModelInfo[]> {
  const results = await Promise.allSettled(
    configured.map((id) => ADAPTERS[id].listModels()),
  )
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}
```

Create `src/lib/providers/keys.ts`:

```ts
import type { ProviderId } from './modelRef'

/**
 * Browser-side client for the dev server's key routes.
 *
 * This module never holds key material. A key travels one way — out of the page,
 * once — and the only thing that comes back is whether a provider has a key and
 * what its last four characters are.
 */
export interface KeyStatus {
  id: ProviderId
  suffix: string
}

export async function fetchKeyStatus(): Promise<KeyStatus[]> {
  const res = await fetch('/api/keys')
  if (!res.ok) return []
  const data = (await res.json()) as { keys?: KeyStatus[] }
  return data.keys ?? []
}

export async function putKey(id: ProviderId, key: string): Promise<KeyStatus[]> {
  const res = await fetch(`/api/keys/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })
  const data = (await res.json()) as { keys?: KeyStatus[]; error?: string }
  if (!res.ok) throw new Error(data.error ?? `Could not save the ${id} key`)
  return data.keys ?? []
}

export async function removeKey(id: ProviderId): Promise<KeyStatus[]> {
  const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' })
  const data = (await res.json()) as { keys?: KeyStatus[] }
  return data.keys ?? []
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- registry`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/registry.ts src/lib/providers/keys.ts tests/lib/providers/registry.test.ts
git commit -m "feat(providers): registry and browser-side key client"
```

---

## Task 11: Route chat through the registry

**Files:**
- Modify: `src/hooks/useChat.ts:3` (import), `src/hooks/useChat.ts:211-240` (the stream call)
- Modify: `src/hooks/useArena.ts` (same pattern)
- Modify: `src/lib/modelPrefs.ts` (qualified refs)
- Test: `tests/lib/modelPrefs.test.ts`

**Interfaces:**
- Consumes: `resolve` (Task 10), `lookupPricing` (Task 2), `computeStat` (Task 3).

- [ ] **Step 1: Write the failing test for prefs migration**

Create `tests/lib/modelPrefs.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KEY, loadModelPrefs, saveModelPrefs } from '../../src/lib/modelPrefs'

/** vitest runs in the 'node' environment, which has no localStorage. */
function createLocalStorageMock(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

describe('loadModelPrefs', () => {
  it('qualifies legacy bare Ollama names, so existing users keep their default and favorites', () => {
    localStorage.setItem(KEY, JSON.stringify({ defaultModel: 'qwen2.5:0.5b', favorites: ['llama3.1:8b'] }))
    const prefs = loadModelPrefs()
    expect(prefs.defaultModel).toBe('ollama:qwen2.5:0.5b')
    expect(prefs.favorites).toEqual(['ollama:llama3.1:8b'])
  })

  it('leaves an already-qualified ref alone', () => {
    localStorage.setItem(KEY, JSON.stringify({ defaultModel: 'openai:gpt-4o-mini', favorites: [] }))
    expect(loadModelPrefs().defaultModel).toBe('openai:gpt-4o-mini')
  })

  it('round-trips through save', () => {
    saveModelPrefs({ defaultModel: 'anthropic:claude-haiku-4-5', favorites: ['ollama:m'] })
    expect(loadModelPrefs().defaultModel).toBe('anthropic:claude-haiku-4-5')
  })

  it('returns empty prefs when nothing is stored', () => {
    expect(loadModelPrefs()).toEqual({ defaultModel: '', favorites: [] })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- modelPrefs`
Expected: FAIL — legacy names are returned bare.

- [ ] **Step 3: Qualify refs in `src/lib/modelPrefs.ts`**

Add the import and a normalizer, and apply it in `loadModelPrefs`:

```ts
import { formatModelRef, parseModelRef } from './providers/modelRef'

/**
 * Values persisted before multi-provider are bare Ollama names. Re-qualify them
 * on read so old installs keep their default model and favorites; they are
 * written back in qualified form on the next save.
 */
function qualify(ref: string): string {
  if (!ref) return ref
  const { providerId, id } = parseModelRef(ref)
  return formatModelRef(providerId, id)
}
```

In `loadModelPrefs`, wrap the two reads:

```ts
    return {
      defaultModel: typeof p.defaultModel === 'string' ? qualify(p.defaultModel) : '',
      favorites: Array.isArray(p.favorites)
        ? p.favorites.filter((x): x is string => typeof x === 'string').map(qualify)
        : [],
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- modelPrefs`
Expected: PASS (4 tests).

- [ ] **Step 5: Point `useChat` at the registry**

Replace the import on `src/hooks/useChat.ts:3`:

```ts
import { isAbortError } from '../lib/ollama'
import { resolve } from '../lib/providers/registry'
import { lookupPricing } from '../lib/providers/pricing'
```

Replace the streaming block (around `src/hooks/useChat.ts:211-240`). The adapter now measures its own timings, so `t0` / `firstTokenAt` bookkeeping moves out of the hook:

```ts
      const { adapter, modelId } = resolve(model)
      const usage = await adapter.streamChat({
        model: modelId,
        messages: outgoing,
        temperature,
        signal: controller.signal,
        onToken: (chunk) => {
          // ...existing token-append logic, unchanged...
        },
        providerOptions: numCtx !== undefined ? { num_ctx: numCtx } : undefined,
      })

      const stat = computeStat({
        conversationId: id,
        model,                       // the qualified ref
        startedAt: now,
        usage,
        pricing: lookupPricing(model),
      })
```

Keep every other line of the hook — the partial-text-on-abort behavior, the error branches, and the persistence — exactly as it is.

- [ ] **Step 6: Apply the same change to `useArena.ts`**

Same three edits: import `resolve` + `lookupPricing`, call `adapter.streamChat`, pass `usage` and `pricing` to `computeStat`. Arena's per-column error isolation is unchanged.

- [ ] **Step 7: Run the full suite and type-check**

Run: `npm test && npm run build`
Expected: all tests pass; `tsc` clean.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useChat.ts src/hooks/useArena.ts src/lib/modelPrefs.ts tests/lib/modelPrefs.test.ts
git commit -m "feat(chat): route generation through the provider registry"
```

---

## Task 12: Provider UI — picker and settings

The last task, and the only one without unit tests: the suite covers `lib/`, not components. Verification is manual and scripted below.

**Files:**
- Modify: `src/components/ChatInput.tsx` (model picker)
- Create: `src/components/SettingsProviders.tsx`
- Modify: `src/components/SettingsModal.tsx` (register the tab)

**Interfaces:**
- Consumes: `listAllModels`, `resolve` (Task 10); `fetchKeyStatus`, `putKey`, `removeKey` (Task 10); `PRICES_AS_OF`, `savePriceOverride`, `loadPricing` (Task 2).

- [ ] **Step 1: Build the Providers settings tab**

Create `src/components/SettingsProviders.tsx`. Match the surrounding Tailwind idiom
used by `SettingsConnection.tsx` — this is the logic, not the final styling:

```tsx
import { useEffect, useState } from 'react'
import { fetchKeyStatus, putKey, removeKey, type KeyStatus } from '../lib/providers/keys'
import { PRICES_AS_OF, loadPricing, savePriceOverride } from '../lib/providers/pricing'
import type { ProviderId } from '../lib/providers/modelRef'

const CLOUD: { id: ProviderId; name: string }[] = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
]

export function SettingsProviders() {
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [pricing, setPricing] = useState(() => loadPricing())

  useEffect(() => {
    void fetchKeyStatus().then(setKeys)
  }, [])

  async function add(id: ProviderId) {
    const key = (drafts[id] ?? '').trim()
    if (!key) return
    setError('')
    try {
      setKeys(await putKey(id, key))
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not save the ${id} key`)
    } finally {
      // Drop the key from component state immediately — it has been handed to
      // the dev server and has no business living on in the page.
      setDrafts((d) => ({ ...d, [id]: '' }))
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm opacity-70">
        Keys are held by the local dev server, not by your browser — the page never sees them.
      </p>

      {CLOUD.map(({ id, name }) => {
        const existing = keys.find((k) => k.id === id)
        return (
          <div key={id} className="flex items-center gap-3">
            <span className="w-24 font-medium">{name}</span>
            {existing ? (
              <>
                <code className="opacity-70">{existing.suffix}</code>
                <button onClick={async () => setKeys(await removeKey(id))}>Remove</button>
              </>
            ) : (
              <>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={`${name} API key`}
                  value={drafts[id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                />
                <button onClick={() => void add(id)}>Add</button>
              </>
            )}
          </div>
        )
      })}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div>
        <h3 className="font-medium">Pricing</h3>
        <p className="text-sm opacity-70">
          Prices as of {PRICES_AS_OF}, in USD per million tokens. Providers change these —
          correct any that are wrong, and costs shown in chat are always estimates.
        </p>
        {Object.entries(pricing).map(([ref, p]) => (
          <div key={ref} className="flex items-center gap-2">
            <span className="w-56 font-mono text-sm">{ref}</span>
            <input
              type="number" step="0.01" defaultValue={p.inputPerMTok}
              onBlur={(e) => {
                const next = { ...p, inputPerMTok: Number(e.target.value) }
                savePriceOverride(ref, next)
                setPricing(loadPricing())
              }}
            />
            <input
              type="number" step="0.01" defaultValue={p.outputPerMTok}
              onBlur={(e) => {
                const next = { ...p, outputPerMTok: Number(e.target.value) }
                savePriceOverride(ref, next)
                setPricing(loadPricing())
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Register the tab in `SettingsModal.tsx`**

`SettingsModal` already has a tab union, a tab list, and a body switch (see how
`'connection'` is wired). Make the same three additions for `'providers'`:

```tsx
// 1. the union
type Tab = 'appearance' | 'chat' | 'connection' | 'providers' | 'voice' | 'data'

// 2. the tab list — place it after Connection
{ id: 'providers', label: 'Providers' },

// 3. the body
{tab === 'providers' && <SettingsProviders />}
```

Import it: `import { SettingsProviders } from './SettingsProviders'`.

> If the existing union or tab-list shape differs from the above, follow the file's
> actual pattern — the point is a fourth tab rendered exactly like the others, not
> these literal lines.

- [ ] **Step 3: Group the model picker by provider in `ChatInput.tsx`**

`ChatInput` currently takes `models: OllamaModel[]` (line 70). Change that prop to
`models: ModelInfo[]`, sourced from `listAllModels(configured)` by the caller, and
group them for rendering:

```tsx
import type { ModelInfo } from '../lib/providers/types'
import { PROVIDER_IDS, type ProviderId } from '../lib/providers/modelRef'

const PROVIDER_LABEL: Record<ProviderId, string> = {
  ollama: 'Ollama (local)',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
}

/** Favorites first across every provider, then grouped by provider for display. */
function groupModels(models: ModelInfo[], favorites: string[]): [ProviderId, ModelInfo[]][] {
  const isFav = (m: ModelInfo) => favorites.includes(m.ref)
  return PROVIDER_IDS
    .map((id): [ProviderId, ModelInfo[]] => [
      id,
      models
        .filter((m) => m.providerId === id)
        .sort((a, b) => Number(isFav(b)) - Number(isFav(a)) || a.label.localeCompare(b.label)),
    ])
    .filter(([, ms]) => ms.length > 0)
}
```

Render one section per group with `PROVIDER_LABEL[id]` as the heading. Then:

- A cloud provider with **no key** still gets a section, rendered **disabled**, with the
  remedy stated in place: `Add an ${PROVIDER_LABEL[id]} key in Settings to use these.`
  (Derive "has a key" from `fetchKeyStatus()`.)
- Where `m.pricing` exists, show it on the row:
  `≈ ${m.pricing.inputPerMTok} / ${m.pricing.outputPerMTok} per Mtok`.
- The connection status dot currently reflects Ollama unconditionally. Make it reflect the
  **selected** model's provider — an OpenAI model must not show "Ollama offline".

- [ ] **Step 4: Verify manually**

```bash
npm run dev
```

Check each, in order:

1. With no keys: only Ollama models are selectable; OpenAI and Anthropic appear, disabled, with the remedy text.
2. Add an OpenAI key in Settings → Providers. The picker gains OpenAI models with prices shown.
3. Send a message on an OpenAI model. It streams. The stat line reads `gpt-4o-mini · … · ≈ $0.00xx`.
4. Send a message on an Ollama model. The stat line is **unchanged from today** and shows **no** `$` segment.
5. Open DevTools → Network. Inspect the request to `/openai/v1/chat/completions`: it carries **no** `Authorization` header from the browser. Inspect `/api/keys`: the response contains a suffix, **no key**.
6. Enter a deliberately wrong key. The reply fails with *"Your OpenAI key was rejected"* — and does **not** silently fall back to Ollama.
7. `git status` does not list `.keys.local.json`.

- [ ] **Step 5: Run the full suite, type-check, and commit**

```bash
npm test && npm run build
git add src/components/ChatInput.tsx src/components/SettingsProviders.tsx src/components/SettingsModal.tsx
git commit -m "feat(ui): provider-grouped model picker and provider settings"
```

---

## Done

At this point: three providers behind one interface, keys that never touch the browser, honest cost on every priced generation, and the Ollama path behaving exactly as it did before.

Open a PR into `main` (it is protected — PR required, no approvals needed).

**Deferred to sub-project 2:** budget caps and hard stops, spend analytics, cross-provider regeneration, and the remaining providers (Google, DeepSeek, Groq, Together, OpenRouter, custom OpenAI-compatible endpoints).
