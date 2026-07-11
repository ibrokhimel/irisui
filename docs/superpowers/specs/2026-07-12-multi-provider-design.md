# Multi-Provider Chat — Design

**Date:** 2026-07-12
**Branch:** `feat/multi-provider` (cut from `main` @ `ed34c8f`)
**Status:** design approved, plan pending

Turn IrisUI from an Ollama client into a provider-agnostic one: the user picks a
model from any configured provider — local or cloud — and the rest of the app
does not care which.

This spec covers **sub-project 1 only**. It is the first of several; the scope
boundary is stated explicitly below because the original vision spans six
independent subsystems and does not fit one plan.

---

## Scope

**In:**

- A `ProviderAdapter` interface, and a registry that resolves a model to its adapter.
- Three adapters: Ollama (ported from existing code), OpenAI, Anthropic.
- A key vault that keeps API keys **out of the browser entirely**.
- Provider-neutral usage/stat data, with per-message cost recorded.
- Qualified model identity (`provider:model`) across storage and preferences.
- A model picker grouped by provider.

**Out (later sub-projects):**

- Budget caps, hard spend limits, spend analytics, projected monthly spend.
- Cross-provider conversation threading ("regenerate this with another model").
- Google, DeepSeek, Groq, Together, OpenRouter, custom OpenAI-compatible endpoints.
- Tool use, vision, structured output.

**Non-goal:** abstracting model *management*. Pull, delete, `/api/show`, and
benchmark are Ollama-only concepts — OpenAI has no notion of downloading a model
to disk. Abstracting them would yield an interface that is mostly
`notSupported()`. `ModelsPage`, `ModelRow`, and `useModelPull` keep talking to
`lib/ollama.ts` directly and are untouched by this work.

---

## Context: what the code looks like today

- `lib/ollama.ts` — a clean, self-contained Ollama client. `streamChat()` already
  has a params-in / result-out shape.
- `streamChat` has exactly **two** consumers: `hooks/useChat.ts` and `hooks/useArena.ts`.
- `lib/stats.ts` imports `ChatStreamResult` from `lib/ollama` — the one place
  Ollama leaks into the domain model. `computeStat` is built on `evalDurationNs`
  and `loadDurationNs`, which only Ollama returns.
- Model identity is a bare string: `Conversation.model`, `ModelPrefs.defaultModel`,
  `ModelPrefs.favorites`.
- The browser reaches Ollama through the Vite dev proxy (`/ollama` →
  `localhost:11434`). The app is run locally via `npm run dev`; the dev server is
  always present.

The chat seam is narrow. The stats leak and the bare-string model identity are
the two things that genuinely have to change.

---

## Architecture

### The adapter boundary

New directory `src/lib/providers/`:

```ts
export type ProviderId = 'ollama' | 'openai' | 'anthropic'

export interface ModelInfo {
  ref: string                  // qualified: 'openai:gpt-5.4'
  providerId: ProviderId
  id: string                   // provider-native id: 'gpt-5.4'
  label: string
  contextLength?: number       // absent when unknown
  pricing?: ModelPricing       // absent when unknown
}

export interface StreamChatParams {
  model: string                // provider-native id
  messages: { role: string; content: string }[]
  temperature: number
  signal: AbortSignal
  onToken: (delta: string) => void
  providerOptions?: Record<string, unknown>   // e.g. Ollama's num_ctx
}

export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  ttftMs: number               // client-measured, every provider
  totalMs: number              // client-measured, every provider
  serverEvalNs?: number        // Ollama only — absent elsewhere
  loadDurationNs?: number      // Ollama only — absent elsewhere
}

export interface ProviderAdapter {
  id: ProviderId
  name: string
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  streamChat(p: StreamChatParams): Promise<ChatUsage>
  embed?(model: string, texts: string[]): Promise<number[][]>
}
```

Provider-specific knobs travel in `providerOptions` rather than polluting the
neutral params. This matters concretely: the `feat/auto-context-window` branch is
actively tuning Ollama's `num_ctx`, and routing it through `providerOptions`
keeps that work from colliding with this one.

`registry.ts` maps a `ProviderId` to its adapter and exposes
`resolve(ref): { adapter, modelId }`. `useChat` and `useArena` call the registry;
they never import a provider module directly.

### Transport

Every provider is reached through a Vite proxy, so all requests are same-origin
and **CORS never applies to any provider**. This is a deliberate consequence of
the app being run locally via `npm run dev` — it removes any dependency on a
given provider's browser-origin policy, which we would otherwise have to verify
per provider and which could change under us.

```
/ollama/*     → http://localhost:11434
/openai/*     → https://api.openai.com
/anthropic/*  → https://api.anthropic.com
```

### The key vault

A Vite plugin (`providerProxyPlugin`) owns API keys. **Keys never enter the
browser.**

```
POST   /api/keys/:id    store a key; validate it with a live call; return only {valid}
GET    /api/keys        → [{ id, suffix: '…aB3c', valid }]     never key material
DELETE /api/keys/:id    remove a key
```

Keys are persisted to `.keys.local.json` (gitignored) with owner-only file
permissions. On a proxied request the plugin injects the provider's auth header
— `Authorization: Bearer …` for OpenAI, `x-api-key` + `anthropic-version` for
Anthropic. The page sends a `providerId`; it never sends, receives, or stores a
key.

The key is therefore **write-only from the page's perspective**: a compromised
page cannot read it back, because no endpoint returns it.

Two hard requirements, both tested:

1. No response body from any `/api/keys` route may contain key material — only a
   masked suffix.
2. If the dev server is bound to a non-loopback address (`vite --host`), the
   `/api/keys` routes and the authenticated proxies **refuse to serve** and log
   why. Otherwise anyone on the LAN could spend the user's money.

Keys are never written to logs.

`KeyVault` is an interface with one implementation today (`DevServerVault`, the
client for the routes above). This is the same swappable-backend pattern already
used for `ChatStore`. A Tauri build can supply a `KeychainVault` behind the same
interface with no UI changes — relevant because desktop work is in flight on a
separate branch.

---

## Data model changes

### Usage and stats

`ChatStreamResult` becomes `ChatUsage`, with Ollama's nanosecond timings
**optional**. `lib/stats.ts` stops importing from `lib/ollama`.

`computeStat` needs almost no change, because it already falls back to wall-clock
timing when server timing is absent:

```ts
const tokensPerSec =
  evalSec > 0  ? completionTokens / evalSec    // Ollama's server-reported timing
  : wallSec > 0 ? completionTokens / wallSec   // already present; cloud lands here
  : 0
```

Cloud providers report token usage but no eval duration, so they fall through to
the existing, already-tested branch.

`MessageStat` and `GenerationStat` each gain:

```ts
providerId?: ProviderId   // absent on messages persisted before this change
costUsd?: number          // absent when the model's price is unknown
```

**`costUsd` absent is not `costUsd: 0`.** When a price is unknown the UI shows no
cost at all. It never renders `$0.00` as a stand-in, and it never renders a bare
dollar figure — costs are always prefixed `≈`, because output-token pricing means
the true cost is only known after generation and input-token counts are our own
estimate.

Back-compat: a persisted `MessageStat` with no `providerId` is Ollama. The stat
line renders exactly as it does today for those messages.

### Model identity

Model refs become qualified — `ollama:qwen2.5:0.5b`, `openai:gpt-5.4` — across
`Conversation.model`, `ModelPrefs.defaultModel`, and `ModelPrefs.favorites`.

**Ollama model names already contain colons.** A naive `split(':')` mangles
`qwen2.5:0.5b`. Two pure, tested functions own this, and `split(':')` appears
nowhere else:

```ts
parseModelRef('ollama:qwen2.5:0.5b')  // → { providerId: 'ollama', id: 'qwen2.5:0.5b' }
formatModelRef({ providerId, id })
```

`parseModelRef` splits on the **first** colon only. A ref with no recognized
provider prefix is read as Ollama, which makes every existing persisted value
valid without a migration step; values are rewritten in qualified form on next
save.

### Pricing

A seed table, `lib/providers/pricing.ts`, exporting `PRICES_AS_OF: string` and a
`ModelPricing` per known model (USD per million tokens, input and output).

The table is **user-overridable in Settings**, and the UI displays the "as of"
date next to it. Prices published by providers change, and a cost tracker that
silently shows stale numbers is worse than one that shows none — the user trusts
the figure. Unknown model → no pricing → no cost shown.

Pricing is data, not logic: a live-fetching source can later implement the same
lookup without touching cost math.

---

## UI

**Model picker** (in `ChatInput`): grouped by provider, searchable, favorites
first across all providers. A provider with no key is listed but disabled, with
the remedy stated — "Add an OpenAI key to use this." Cost per model is shown from
the pricing table where known.

**Settings → Providers** (new tab): add/remove a key per provider, showing the
masked suffix and validation state; edit pricing; see the "as of" date.

**Stat line**: unchanged for Ollama. For cloud models it gains `≈ $0.0042`.

**Status dot**: `OllamaStatus` generalizes to a per-provider status; the dot
reflects the *selected* provider.

---

## Error handling

Three failure classes, kept distinct — extending the existing habit of
distinguishing "Ollama offline" from "Ollama returned an error":

| Condition | Behavior |
|---|---|
| No key configured | Provider disabled in the picker, remedy stated. Not an error. |
| Key rejected (401) | "Your OpenAI key was rejected." Offer re-entry. |
| Rate limited / provider error (429, 5xx) | Surface the provider's own message. Keep any partial stream. |
| Stream aborted | Keep partial text — existing behavior, unchanged. |

**Never silently fall back to another provider.** Spending the user's money on a
model they did not choose is unacceptable, and a silent downgrade is precisely
the sort of fake behavior the project's documentation disavows.

Capabilities are resolved **per model, not per provider** — Ollama supports tool
calling and vision on some models, and provider-level capability tables are
wrong. Unknown capability → the feature is hidden, never a broken button.

---

## Testing

The existing suite is 182 tests of mostly pure functions against fixtures. The
new code fits that shape and stays offline.

- **Stream parsers** — recorded fixtures per provider: OpenAI SSE `delta` frames,
  Anthropic's event-typed stream, Ollama NDJSON. Each parser is held to the bar
  the existing NDJSON reader already meets: malformed lines, truncated final
  chunks, and interleaved error frames must not crash it.
- **Cost math** — pure. `(tokens, pricing) → costUsd`, and the case that matters
  most: unknown pricing → `undefined`, never `0`.
- **`parseModelRef` / `formatModelRef`** — colon-bearing Ollama names, unprefixed
  legacy refs, round-tripping.
- **Key vault** — the two security assertions: no `/api/keys` response contains
  key material; a non-loopback bind refuses to serve.
- **`computeStat`** — a `ChatUsage` with no server timings produces a wall-clock
  `tokensPerSec` rather than zero.

Adapters are tested against fixtures, never the live network.

---

## Risks

- **Pricing data cannot be verified at authoring time.** Prices in the seed table
  are a starting point, dated, and user-correctable. This is why cost is always
  shown as an estimate and never as a bare figure.
- **The dev server holds real API keys.** Hence the loopback-only guard. This is
  the single most security-sensitive component in the project.
- **Overlap with `feat/auto-context-window`** on `num_ctx`. Contained by routing
  it through `providerOptions`; if that branch lands first, this one rebases onto
  it.
- **Desktop work is in flight on `feat/tauri-migration`.** The `KeyVault`
  interface is the seam that lets a keychain-backed implementation replace the
  dev-server one without UI changes.
