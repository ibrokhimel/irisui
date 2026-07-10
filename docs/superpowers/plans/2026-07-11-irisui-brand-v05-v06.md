# IrisUI — Brand Refresh + v0.5 Pulse + v0.6 Oracle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the new IRIS brand identity, the v0.5 Performance Dashboard (real per-response stats + Stats page), and v0.6 Hardware Intelligence (RAM-aware model recommendations), continuing the roadmap from the already-shipped v0.1–v0.4.

**Architecture:** IrisUI is a local-first React SPA talking to Ollama via a Vite dev proxy (`/ollama`) and to Hugging Face via `/hf`. Conversations persist in IndexedDB behind a swappable `ChatStore` interface (`src/lib/store.ts`); theming is CSS custom properties overridden at runtime. This plan adds: a brand mark component + brand font, a stats pipeline (Ollama's real `eval_count`/`eval_duration` metadata → IndexedDB → dashboard), and a pure-function recommendation engine keyed on a user hardware profile. Vitest is introduced for pure-logic TDD; UI behavior is verified with headless Playwright scripts (the project's established pattern).

**Tech Stack:** React 18, Vite 7, TypeScript (strict), Tailwind CSS v4 (`@theme` tokens), react-markdown + rehype-highlight, lucide-react, IndexedDB. New in this plan: `@fontsource/michroma` (brand font), `recharts` (charts), `vitest` + `fake-indexeddb` (tests).

## Global Constraints

- **Local-first.** No external requests except explicit user actions (model pull, HF browse). No accounts, no cloud, no telemetry.
- **No fake features.** Effort levels stay system-prompt presets with the exact strings in `src/constants.ts`. Stats must come from Ollama's real metadata or honest client-side timing — never fabricated. Hardware advice must be labeled as estimates.
- **Web-first.** Nothing in this plan may depend on Tauri/native APIs. Desktop is v0.7 (separate plan).
- **Storage stays behind interfaces.** Conversations: `ChatStore` (`src/lib/store.ts`). Stats: same IndexedDB database (`irisui`), new object store. SQLite drops in at v0.7 behind the same interfaces.
- **Temperature default 0.7, range 0.0–2.0** (already in `src/constants.ts` — do not change).
- **Keep files under 500 lines. Validate input at system boundaries.**
- **Destructive actions require confirmation** (existing `ConfirmDialog` pattern).
- **Build gate:** `npm run build` (tsc strict + Vite) must pass at every commit. Test gate once Task 2 lands: `npm test` must pass.
- **Do not commit unless the user asks.** Each task ends at "ready to commit" state; batch commits are at the user's discretion (their repo, their call).

## Current State (already shipped on `main` — do not rebuild)

| Version | Status | Where |
|---|---|---|
| v0.1 Blink — chat shell, streaming, markdown, effort/temp, dev script | ✅ | `src/hooks/useChat.ts`, `src/lib/ollama.ts`, `src/components/ChatInput.tsx`, `scripts/start-ollama-dev.mjs` |
| v0.2 Focus — regenerate, copy message, streaming caret, home-screen redesign | ✅ (partial: code-block copy button + continue-response still open, folded into Task 8 stretch) | `src/components/Message.tsx`, `HomeScreen.tsx` |
| v0.3 Memory — IndexedDB history, rename/delete/search, MD/JSON export, per-chat model/effort/temp | ✅ | `src/lib/store.ts`, `idbStore.ts`, `exporters.ts`, `Sidebar.tsx` |
| v0.4 Forge — Models page: pull w/ speed+ETA, delete w/ confirm, favorites, default, benchmark, HF live browser w/ infinite scroll | ✅ | `src/components/ModelsPage.tsx`, `ModelRow.tsx`, `HuggingFaceBrowser.tsx`, `src/hooks/useModelPull.ts`, `src/lib/modelCatalog.ts` |
| Theming — Light/Dark/Wine presets + accent picker, persisted | ✅ | `src/theme.ts`, `SettingsModal.tsx` |

## File Structure (new/modified by this plan)

```
public/iris.svg                     — replace: new IRIS mark favicon
src/components/IrisMark.tsx         — new: brand mark SVG component
src/components/StatsPage.tsx        — new: v0.5 dashboard
src/components/HardwarePanel.tsx    — new: v0.6 RAM profile + recommendations
src/lib/stats.ts                    — new: pure stat math + formatting (TDD)
src/lib/statsStore.ts               — new: stats persistence (IndexedDB)
src/lib/hardware.ts                 — new: hardware profile detect/persist
src/lib/recommend.ts                — new: pure fit + recommendation rules (TDD)
src/lib/idbStore.ts                 — modify: DB v2 upgrade, export openDB
src/lib/ollama.ts                   — modify: streamChat returns generation metadata
src/hooks/useChat.ts                — modify: capture + persist stats
src/types.ts                        — modify: MessageStat on ChatMessage
src/index.css                       — modify: --font-brand token
src/main.tsx                        — modify: import Michroma
src/App.tsx                         — modify: 'stats' view
src/components/Sidebar.tsx          — modify: brand lockup, Stats nav
src/components/HomeScreen.tsx       — modify: IrisMark in hero
src/components/Message.tsx          — modify: IrisMark avatar + stat line
src/components/ModelsPage.tsx       — modify: mount HardwarePanel + fit badges
src/components/ModelRow.tsx         — modify: fit badge prop
vitest.config.ts                    — new: test runner config
tests/lib/*.test.ts                 — new: unit tests
```

---

### Task 1: IRIS Brand — mark, wordmark font, favicon

**Files:**
- Create: `src/components/IrisMark.tsx`
- Modify: `src/main.tsx`, `src/index.css`, `src/components/Sidebar.tsx`, `src/components/HomeScreen.tsx`, `src/components/Message.tsx`
- Replace: `public/iris.svg`
- Delete: `src/components/Spark.tsx` (fully superseded)

**Interfaces:**
- Consumes: nothing new.
- Produces: `IrisMark({ className }: { className?: string })` — React component, colors via `currentColor`. CSS utility class `font-brand` (Michroma). All later tasks referencing the brand use `IrisMark`.

- [ ] **Step 1: Install the brand font**

```bash
npm install @fontsource/michroma
```

- [ ] **Step 2: Create the mark component**

Create `src/components/IrisMark.tsx`. Geometry: three congruent blades (radial spoke + two rounded outer-hexagon edges) rotated 120° apart around a rounded hexagonal aperture — generated, verified against the reference logo, and frozen as literal paths:

```tsx
/** The IRIS aperture-hex mark. Colors via currentColor. */
export function IrisMark({ className = '' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none" className={className} aria-hidden="true">
      <path d="M 56.54 44.00 Q 60.00 42.00 63.46 44.00 L 72.12 49.00 Q 75.59 51.00 75.59 55.00 L 75.59 65.00 Q 75.59 69.00 72.12 71.00 L 63.46 76.00 Q 60.00 78.00 56.54 76.00 L 47.88 71.00 Q 44.41 69.00 44.41 65.00 L 44.41 55.00 Q 44.41 51.00 47.88 49.00 Z" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
      <path d="M 60.00 42.00 L 60.00 30.00 Q 60.00 16.00 72.12 23.00 L 85.98 31.00 Q 98.11 38.00 98.11 52.00 L 98.11 77.50" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 44.41 69.00 L 34.02 75.00 Q 21.89 82.00 21.89 68.00 L 21.89 52.00 Q 21.89 38.00 34.02 31.00 L 56.10 18.25" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 75.59 69.00 L 85.98 75.00 Q 98.11 82.00 85.98 89.00 L 72.12 97.00 Q 60.00 104.00 47.88 97.00 L 25.79 84.25" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
```

- [ ] **Step 3: Load the font and add the brand token**

In `src/main.tsx`, add below the existing highlight.js import:

```ts
import '@fontsource/michroma'
```

In `src/index.css`, add inside the existing `@theme` block:

```css
  --font-brand: "Michroma", ui-sans-serif, sans-serif;
```

(Tailwind v4 exposes this as the `font-brand` utility automatically.)

- [ ] **Step 4: Swap the sidebar brand lockup**

In `src/components/Sidebar.tsx`: replace `import { Spark } from './Spark'` with `import { IrisMark } from './IrisMark'`, and replace the brand block (the `<Spark …/>` + gradient `<span>IrisUI</span>`) with the monochrome reference-style lockup:

```tsx
        <div className="flex items-center gap-3 px-4 py-4">
          <IrisMark className="h-7 w-7 text-fg" />
          <span className="font-brand text-[13px] tracking-[0.35em] text-fg">IRIS</span>
        </div>
```

- [ ] **Step 5: Swap the home hero and message avatar**

In `src/components/HomeScreen.tsx`: replace the `Spark` import/usage with `<IrisMark className="h-9 w-9 text-iris" />`.
In `src/components/Message.tsx`: replace the `Aperture` lucide import/usage in the assistant avatar with `<IrisMark className="h-[18px] w-[18px] text-iris" />` (keep the streaming ring classes unchanged).
Delete `src/components/Spark.tsx`.

- [ ] **Step 6: Replace the favicon**

Overwrite `public/iris.svg` (same four paths, framed and accent-colored):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="26" fill="#1b1a17"/>
  <g fill="none" stroke="#c96442" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="translate(13.2 13.2) scale(0.78)">
    <path d="M 56.54 44.00 Q 60.00 42.00 63.46 44.00 L 72.12 49.00 Q 75.59 51.00 75.59 55.00 L 75.59 65.00 Q 75.59 69.00 72.12 71.00 L 63.46 76.00 Q 60.00 78.00 56.54 76.00 L 47.88 71.00 Q 44.41 69.00 44.41 65.00 L 44.41 55.00 Q 44.41 51.00 47.88 49.00 Z"/>
    <path d="M 60.00 42.00 L 60.00 30.00 Q 60.00 16.00 72.12 23.00 L 85.98 31.00 Q 98.11 38.00 98.11 52.00 L 98.11 77.50"/>
    <path d="M 44.41 69.00 L 34.02 75.00 Q 21.89 82.00 21.89 68.00 L 21.89 52.00 Q 21.89 38.00 34.02 31.00 L 56.10 18.25"/>
    <path d="M 75.59 69.00 L 85.98 75.00 Q 98.11 82.00 85.98 89.00 L 72.12 97.00 Q 60.00 104.00 47.88 97.00 L 25.79 84.25"/>
  </g>
</svg>
```

- [ ] **Step 7: Verify**

Run: `npm run build` — expected: PASS.
Run the dev server on port 5178 and take a Playwright screenshot (established pattern: `npx playwright screenshot --channel=msedge http://localhost:5178 out.png`). Expected: sidebar shows the mark + letterspaced IRIS wordmark in Michroma; home hero shows the mark; no `Spark` remains (`grep -r "Spark" src/` returns nothing).

---

### Task 2: Introduce Vitest

**Files:**
- Create: `vitest.config.ts`, `tests/lib/format.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `formatBytes`, `formatSpeed`, `formatEta`, `formatCount`, `estimatedRam` from `src/lib/format.ts` (all existing).
- Produces: `npm test` runs vitest on `tests/**/*.test.ts`. All later TDD tasks depend on this harness.

- [ ] **Step 1: Install and configure**

```bash
npm install -D vitest fake-indexeddb
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Write the first test (existing pure helpers)**

Create `tests/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { estimatedRam, formatBytes, formatCount, formatEta, formatSpeed } from '../../src/lib/format'

describe('format helpers', () => {
  it('formats bytes as GB/MB', () => {
    expect(formatBytes(4_700_000_000)).toBe('4.7 GB')
    expect(formatBytes(300_000_000)).toBe('300 MB')
    expect(formatBytes(undefined)).toBe('—')
  })
  it('formats download speed', () => {
    expect(formatSpeed(3_200_000)).toBe('3.2 MB/s')
    expect(formatSpeed(45_000)).toBe('45 KB/s')
    expect(formatSpeed(0)).toBe('')
  })
  it('formats ETA', () => {
    expect(formatEta(42)).toBe('42s left')
    expect(formatEta(95)).toBe('1m 35s left')
    expect(formatEta(0)).toBe('')
  })
  it('formats compact counts', () => {
    expect(formatCount(1234)).toBe('1.2K')
    expect(formatCount(2_500_000)).toBe('2.5M')
  })
  it('estimates RAM from model size', () => {
    expect(estimatedRam(8_300_000_000)).toBe('10 GB') // 8.3 * 1.2 = 9.96 → ceil
  })
})
```

- [ ] **Step 3: Run and make green**

Run: `npm test` — expected: PASS (5 tests). If an expectation mismatches actual helper output, fix the **test** to match the shipped behavior (these helpers are already verified in production; this task only proves the harness).

- [ ] **Step 4: Confirm build still passes**

Run: `npm run build` — expected: PASS.

---

### Task 3: streamChat returns real generation metadata

**Files:**
- Modify: `src/lib/ollama.ts`
- Test: `tests/lib/ollama-stream.test.ts`

**Interfaces:**
- Consumes: existing `readJsonStream`, `readError`.
- Produces (used by Tasks 4/6):

```ts
export interface ChatStreamResult {
  promptTokens: number      // prompt_eval_count from the done chunk (0 if absent)
  completionTokens: number  // eval_count
  evalDurationNs: number    // eval_duration
  totalDurationNs: number   // total_duration
  loadDurationNs: number    // load_duration
}
// signature change:
export async function streamChat(params: StreamChatParams): Promise<ChatStreamResult>
```

- [ ] **Step 1: Write the failing test**

Create `tests/lib/ollama-stream.test.ts` — stub `fetch` with an NDJSON `ReadableStream` ending in a `done` chunk carrying Ollama's real field names:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamChat } from '../../src/lib/ollama'

function ndjsonResponse(lines: object[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(new TextEncoder().encode(JSON.stringify(l) + '\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

afterEach(() => vi.unstubAllGlobals())

describe('streamChat', () => {
  it('forwards tokens and returns the done-chunk metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([
      { message: { content: 'Hel' } },
      { message: { content: 'lo' } },
      { done: true, prompt_eval_count: 12, eval_count: 90, eval_duration: 3_000_000_000, total_duration: 3_900_000_000, load_duration: 500_000_000 },
    ])))
    const tokens: string[] = []
    const result = await streamChat({
      model: 'm', messages: [], temperature: 0.7,
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    })
    expect(tokens.join('')).toBe('Hello')
    expect(result.completionTokens).toBe(90)
    expect(result.promptTokens).toBe(12)
    expect(result.evalDurationNs).toBe(3_000_000_000)
    expect(result.totalDurationNs).toBe(3_900_000_000)
    expect(result.loadDurationNs).toBe(500_000_000)
  })

  it('returns zeros when the stream ends without a done chunk', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([{ message: { content: 'x' } }])))
    const result = await streamChat({
      model: 'm', messages: [], temperature: 0.7,
      signal: new AbortController().signal, onToken: () => {},
    })
    expect(result.completionTokens).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/ollama-stream.test.ts`
Expected: FAIL — `streamChat` currently returns `Promise<void>`, so `result.completionTokens` is undefined.

- [ ] **Step 3: Implement**

In `src/lib/ollama.ts`, add the `ChatStreamResult` interface (above `StreamChatParams`) and change `streamChat`'s tail from:

```ts
  await readJsonStream(res.body, (obj) => {
    const message = obj.message as { content?: unknown } | undefined
    const content = message?.content
    if (typeof content === 'string' && content) onToken(content)
  })
}
```

to:

```ts
  const result: ChatStreamResult = {
    promptTokens: 0, completionTokens: 0,
    evalDurationNs: 0, totalDurationNs: 0, loadDurationNs: 0,
  }
  const num = (v: unknown) => (typeof v === 'number' ? v : 0)
  await readJsonStream(res.body, (obj) => {
    const message = obj.message as { content?: unknown } | undefined
    const content = message?.content
    if (typeof content === 'string' && content) onToken(content)
    if (obj.done) {
      result.promptTokens = num(obj.prompt_eval_count)
      result.completionTokens = num(obj.eval_count)
      result.evalDurationNs = num(obj.eval_duration)
      result.totalDurationNs = num(obj.total_duration)
      result.loadDurationNs = num(obj.load_duration)
    }
  })
  return result
}
```

Update the function signature to `Promise<ChatStreamResult>`. `useChat.ts` compiles unchanged (it currently ignores the return value).

- [ ] **Step 4: Run tests + build**

Run: `npm test` then `npm run build`. Expected: both PASS.

---

### Task 4: Pure stat math (`src/lib/stats.ts`)

**Files:**
- Create: `src/lib/stats.ts`
- Test: `tests/lib/stats.test.ts`

**Interfaces:**
- Consumes: `ChatStreamResult` from `src/lib/ollama.ts`.
- Produces (used by Tasks 5–8):

```ts
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
}): GenerationStat
export function toMessageStat(stat: GenerationStat): MessageStat
export function summarizeByModel(stats: GenerationStat[]): ModelSummary[]  // sorted by count desc
export function formatStatLine(stat: MessageStat): string
// "sera:latest · 22.4 tok/s · first token 620ms · total 8.2s"
```

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/stats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeStat, formatStatLine, summarizeByModel, toMessageStat } from '../../src/lib/stats'

const meta = {
  promptTokens: 20, completionTokens: 90,
  evalDurationNs: 3_000_000_000, totalDurationNs: 3_900_000_000, loadDurationNs: 500_000_000,
}

describe('computeStat', () => {
  it('derives tokens/sec from Ollama eval metadata', () => {
    const s = computeStat({ conversationId: 'c1', model: 'm', startedAt: 1000, ttftMs: 620, totalMs: 8200, meta })
    expect(s.tokensPerSec).toBeCloseTo(30) // 90 tokens / 3s
    expect(s.loadMs).toBe(500)
    expect(s.ttftMs).toBe(620)
    expect(s.id).toBeTruthy()
  })
  it('falls back to wall time when eval_duration is 0', () => {
    const s = computeStat({ conversationId: 'c1', model: 'm', startedAt: 1000, ttftMs: 100, totalMs: 3000, meta: { ...meta, evalDurationNs: 0 } })
    expect(s.tokensPerSec).toBeCloseTo(30) // 90 tokens / 3s wall
  })
})

describe('summarizeByModel', () => {
  it('averages per model and sorts by usage', () => {
    const mk = (model: string, tps: number, at: number) =>
      computeStat({ conversationId: 'c', model, startedAt: at, ttftMs: 100, totalMs: 1000, meta: { ...meta, completionTokens: tps * 3 } })
    const sums = summarizeByModel([mk('a', 10, 1), mk('a', 20, 2), mk('b', 40, 3)])
    expect(sums[0].model).toBe('a')
    expect(sums[0].count).toBe(2)
    expect(sums[0].avgTokensPerSec).toBeCloseTo(15)
    expect(sums[1].lastUsed).toBe(3)
  })
})

describe('formatStatLine', () => {
  it('renders the compact line', () => {
    const s = computeStat({ conversationId: 'c', model: 'sera:latest', startedAt: 1, ttftMs: 620, totalMs: 8200, meta: { ...meta, completionTokens: 67, evalDurationNs: 2_991_071_428 } })
    expect(formatStatLine(toMessageStat(s))).toBe('sera:latest · 22.4 tok/s · first token 620ms · total 8.2s')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/lib/stats.test.ts` — expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/stats.ts`**

```ts
import type { ChatStreamResult } from './ollama'

/* interfaces exactly as in the Interfaces block above */

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
```

- [ ] **Step 4: Run tests + build**

Run: `npm test && npm run build` — expected: PASS.

---

### Task 5: Stats persistence (IndexedDB v2)

**Files:**
- Modify: `src/lib/idbStore.ts` (bump `DB_VERSION` to 2, create `stats` store, export `openDB`)
- Create: `src/lib/statsStore.ts`
- Test: `tests/lib/statsStore.test.ts`

**Interfaces:**
- Consumes: `GenerationStat` from Task 4; `openDB` (newly exported from `idbStore.ts`).
- Produces (used by Tasks 6 & 8):

```ts
export async function addStat(stat: GenerationStat): Promise<void>
export async function listStats(limit?: number): Promise<GenerationStat[]> // newest first
export async function clearStats(): Promise<void>
```

- [ ] **Step 1: Write the failing test**

Create `tests/lib/statsStore.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addStat, clearStats, listStats } from '../../src/lib/statsStore'
import { computeStat } from '../../src/lib/stats'

const meta = { promptTokens: 1, completionTokens: 30, evalDurationNs: 1e9, totalDurationNs: 1.2e9, loadDurationNs: 0 }
const mk = (at: number) => computeStat({ conversationId: 'c', model: 'm', startedAt: at, ttftMs: 50, totalMs: 1200, meta })

describe('statsStore', () => {
  beforeEach(async () => { await clearStats() })

  it('round-trips stats newest-first with a limit', async () => {
    await addStat(mk(1)); await addStat(mk(3)); await addStat(mk(2))
    const all = await listStats()
    expect(all.map((s) => s.startedAt)).toEqual([3, 2, 1])
    expect((await listStats(2)).length).toBe(2)
  })

  it('clearStats empties the store', async () => {
    await addStat(mk(1))
    await clearStats()
    expect(await listStats()).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/lib/statsStore.test.ts` — expected: FAIL (module not found).

- [ ] **Step 3: Implement**

In `src/lib/idbStore.ts`: change `const DB_VERSION = 1` to `2`, add `const STATS = 'stats'` beside `META`/`MSGS`, add inside `onupgradeneeded` (after the existing two `contains` guards):

```ts
      if (!db.objectStoreNames.contains(STATS)) db.createObjectStore(STATS, { keyPath: 'id' })
```

Change `function openDB` to `export function openDB` and also export the constant: `export const STATS = 'stats'` (replace the local declaration).

Create `src/lib/statsStore.ts`:

```ts
import type { GenerationStat } from './stats'
import { STATS, openDB } from './idbStore'

let dbp: Promise<IDBDatabase> | null = null
const getDB = () => (dbp ??= openDB())

export async function addStat(stat: GenerationStat): Promise<void> {
  const db = await getDB()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STATS, 'readwrite')
    t.objectStore(STATS).put(stat)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export async function listStats(limit?: number): Promise<GenerationStat[]> {
  const db = await getDB()
  const all = await new Promise<GenerationStat[]>((resolve, reject) => {
    const req = db.transaction(STATS, 'readonly').objectStore(STATS).getAll()
    req.onsuccess = () => resolve(req.result as GenerationStat[])
    req.onerror = () => reject(req.error)
  })
  const sorted = all.sort((a, b) => b.startedAt - a.startedAt)
  return limit ? sorted.slice(0, limit) : sorted
}

export async function clearStats(): Promise<void> {
  const db = await getDB()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STATS, 'readwrite')
    t.objectStore(STATS).clear()
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}
```

- [ ] **Step 4: Run tests + build**

Run: `npm test && npm run build` — expected: PASS. (Existing-user upgrade path: DB v1 → v2 only adds a store; the `contains` guards keep it idempotent.)

---

### Task 6: Capture stats in the chat loop

**Files:**
- Modify: `src/types.ts`, `src/hooks/useChat.ts`

**Interfaces:**
- Consumes: `streamChat` (Task 3), `computeStat`/`toMessageStat` (Task 4), `addStat` (Task 5).
- Produces: `ChatMessage.stat?: MessageStat` — persisted with the conversation, consumed by Task 7's UI and included automatically in JSON exports.

- [ ] **Step 1: Extend the message type**

In `src/types.ts`:

```ts
import type { MessageStat } from './lib/stats'

export type ChatMessage = {
  id: string
  role: Role
  content: string
  stat?: MessageStat
}
```

- [ ] **Step 2: Wire timing + persistence into `run`**

In `src/hooks/useChat.ts`, add imports:

```ts
import { computeStat, toMessageStat } from '../lib/stats'
import type { MessageStat } from '../lib/stats'
import { addStat } from '../lib/statsStore'
```

Inside `run`, before the `try`: add timing state and start the clock —

```ts
      const t0 = performance.now()
      let firstTokenAt = 0
      let messageStat: MessageStat | undefined
```

In the `onToken` callback, first line: `if (!firstTokenAt) firstTokenAt = performance.now()`.
Change `await streamChat({ … })` to capture the result: `const meta = await streamChat({ … })`, and immediately after (still inside `try`):

```ts
        if (meta.completionTokens > 0) {
          const stat = computeStat({
            conversationId: base.id,
            model: base.model,
            startedAt: now,
            ttftMs: firstTokenAt ? firstTokenAt - t0 : 0,
            totalMs: performance.now() - t0,
            meta,
          })
          messageStat = toMessageStat(stat)
          void addStat(stat)
        }
```

In the `finally` block, attach the stat to the assistant message in both the visible state and the persisted copy: the final `persist` call's assistant message becomes `{ id: assistantId, role: 'assistant', content, stat: messageStat }`, and add before it:

```ts
        if (messageStat) {
          const s = messageStat
          setCurrent((c) =>
            c.id === base.id
              ? { ...c, messages: c.messages.map((m) => (m.id === assistantId ? { ...m, stat: s } : m)) }
              : c,
          )
        }
```

(Aborted or failed generations get no stat — `meta.completionTokens > 0` gates it; an abort throws before `meta` is assigned.)

- [ ] **Step 3: Verify**

Run: `npm test && npm run build` — expected: PASS.
Playwright check against live Ollama: send a message, wait for completion, assert the persisted conversation's last message JSON (via export or IndexedDB read in `page.evaluate`) contains `stat.tokensPerSec > 0`.

---

### Task 7: Per-response stat line UI

**Files:**
- Modify: `src/components/Message.tsx`

**Interfaces:**
- Consumes: `message.stat` (Task 6), `formatStatLine` (Task 4).
- Produces: visible stat line under every completed assistant message.

- [ ] **Step 1: Render the line**

In `src/components/Message.tsx`, import `formatStatLine` from `../lib/stats`. Inside the assistant branch, directly under the `{streaming && <span className="stream-caret" …/>}` line, add:

```tsx
        {!streaming && message.stat && (
          <p className="mt-1.5 font-mono text-[11px] text-muted/70">{formatStatLine(message.stat)}</p>
        )}
```

- [ ] **Step 2: Verify**

Run: `npm run build` — PASS. Playwright: send a message with Ollama online; after completion assert `page.getByText(/tok\/s · first token/)` is visible and screenshot for visual check (line must read like `sera:latest · 22.4 tok/s · first token 620ms · total 8.2s`).

---

### Task 8: Stats page + sidebar nav

**Files:**
- Create: `src/components/StatsPage.tsx`
- Modify: `src/App.tsx` (view union → `'chat' | 'models' | 'stats'`), `src/components/Sidebar.tsx` (Stats nav item), `package.json` (recharts)

**Interfaces:**
- Consumes: `listStats`, `clearStats` (Task 5), `summarizeByModel` (Task 4), existing `ConfirmDialog`.
- Produces: `StatsPage()` — self-loading component (fetches its own data on mount; no props).

> **Executor note:** invoke the `dataviz` skill before writing the chart code. Regardless, all chart colors must come from theme tokens: series stroke `var(--color-iris)`, grid `var(--color-line)`, axis text `var(--color-muted)` — no library-default palettes.

- [ ] **Step 1: Install recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Build the page**

Create `src/components/StatsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Activity, Trash2 } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { GenerationStat } from '../lib/stats'
import { summarizeByModel } from '../lib/stats'
import { clearStats, listStats } from '../lib/statsStore'
import { ConfirmDialog } from './ConfirmDialog'

const AXIS = { fill: 'var(--color-muted)', fontSize: 11 }

export function StatsPage() {
  const [stats, setStats] = useState<GenerationStat[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    void listStats().then(setStats).catch(() => setStats([]))
  }, [])

  const summaries = summarizeByModel(stats)
  const fastest = [...summaries].sort((a, b) => b.avgTokensPerSec - a.avgTokensPerSec)[0]
  const timeline = [...stats].reverse().map((s, i) => ({
    n: i + 1,
    tps: Number(s.tokensPerSec.toFixed(1)),
    totalS: Number((s.totalMs / 1000).toFixed(1)),
  }))

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-fg">
            <Activity className="h-6 w-6 text-iris" />
            Stats
          </h1>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={stats.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:border-rose-500/40 hover:text-rose-200 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
            Clear history
          </button>
        </div>

        {stats.length === 0 ? (
          <div className="rounded-xl border border-line bg-panel/40 px-4 py-10 text-center text-sm text-muted">
            No generations recorded yet. Chat with a model and stats will appear here.
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card label="Generations" value={String(stats.length)} />
              <Card label="Most used" value={summaries[0]?.model ?? '—'} />
              <Card label="Fastest" value={fastest ? `${fastest.model} · ${fastest.avgTokensPerSec.toFixed(1)} tok/s` : '—'} />
            </div>

            <ChartPanel title="Tokens/sec over time">
              <LineChart data={timeline}>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
                <XAxis dataKey="n" tick={AXIS} stroke="var(--color-line)" />
                <YAxis tick={AXIS} stroke="var(--color-line)" width={36} />
                <Tooltip contentStyle={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', borderRadius: 8, color: 'var(--color-fg)' }} />
                <Line type="monotone" dataKey="tps" stroke="var(--color-iris)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ChartPanel>

            <ChartPanel title="Average speed per model (tok/s)">
              <BarChart data={summaries.map((s) => ({ model: s.model.slice(0, 18), avg: Number(s.avgTokensPerSec.toFixed(1)) }))}>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
                <XAxis dataKey="model" tick={AXIS} stroke="var(--color-line)" />
                <YAxis tick={AXIS} stroke="var(--color-line)" width={36} />
                <Tooltip contentStyle={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', borderRadius: 8, color: 'var(--color-fg)' }} />
                <Bar dataKey="avg" fill="var(--color-iris)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ChartPanel>

            <ChartPanel title="Response time (s)">
              <LineChart data={timeline}>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
                <XAxis dataKey="n" tick={AXIS} stroke="var(--color-line)" />
                <YAxis tick={AXIS} stroke="var(--color-line)" width={36} />
                <Tooltip contentStyle={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', borderRadius: 8, color: 'var(--color-fg)' }} />
                <Line type="monotone" dataKey="totalS" stroke="var(--color-iris-strong)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ChartPanel>

            {/* Recent generations */}
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-fg">Recent generations</h2>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-panel2 text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 font-medium">tok/s</th>
                      <th className="px-3 py-2 font-medium">First token</th>
                      <th className="px-3 py-2 font-medium">Total</th>
                      <th className="px-3 py-2 font-medium">Tokens</th>
                      <th className="px-3 py-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.slice(0, 12).map((s) => (
                      <tr key={s.id} className="border-t border-line text-fg/90">
                        <td className="max-w-[180px] truncate px-3 py-2">{s.model}</td>
                        <td className="px-3 py-2">{s.tokensPerSec.toFixed(1)}</td>
                        <td className="px-3 py-2">{s.ttftMs}ms</td>
                        <td className="px-3 py-2">{(s.totalMs / 1000).toFixed(1)}s</td>
                        <td className="px-3 py-2">{s.completionTokens}</td>
                        <td className="px-3 py-2 text-muted">{new Date(s.startedAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        danger
        title="Clear stats history?"
        message="This removes all recorded generation stats. Chats are not affected."
        confirmLabel="Clear"
        onConfirm={() => {
          void clearStats().then(() => setStats([]))
          setConfirmOpen(false)
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel/50 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-fg">{value}</p>
    </div>
  )
}

function ChartPanel({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <section className="mb-4 rounded-xl border border-line bg-panel/40 p-4">
      <h2 className="mb-3 text-sm font-semibold text-fg">{title}</h2>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Wire navigation**

In `src/App.tsx`: change the view state to `useState<'chat' | 'models' | 'stats'>('chat')`, import and render `<StatsPage />` when `view === 'stats'` (same branch structure as `models`), pass `onOpenStats={() => setView('stats')}` to `Sidebar`, and set the TopBar title to `'Stats'` for that view.
In `src/components/Sidebar.tsx`: add props `onOpenStats: () => void` (and include `'stats'` in the `view` prop union), then add below the Models nav button (import `Activity` from lucide-react):

```tsx
          <button
            onClick={onOpenStats}
            className={
              'mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ' +
              (view === 'stats' ? 'bg-panel2 text-fg' : 'text-muted hover:bg-panel2/60 hover:text-fg')
            }
          >
            <Activity className="h-4 w-4" />
            Stats
          </button>
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run build` — PASS. Playwright: with at least 2 recorded generations, open Stats; assert the summary cards, all three charts (`svg.recharts-surface` count ≥ 3), and the recent-generations table render; screenshot for theme check across Light/Dark/Wine.

**Stretch (only if time permits, same task):** code-block copy button in `Markdown.tsx` — the last open v0.2 item.

---

### Task 9: Hardware profile (`src/lib/hardware.ts`)

**Files:**
- Create: `src/lib/hardware.ts`
- Test: `tests/lib/hardware.test.ts`

**Interfaces:**
- Produces (used by Tasks 10–11):

```ts
export interface HardwareProfile { ramGb: number; cores: number | null; source: 'manual' | 'detected' }
export const RAM_OPTIONS: number[] // [8, 16, 32, 64, 128]
export function detectHardware(nav?: { deviceMemory?: number; hardwareConcurrency?: number }): HardwareProfile | null
export function loadHardwareProfile(): HardwareProfile | null  // localStorage 'irisui.hardware'
export function saveHardwareProfile(p: HardwareProfile): void
```

**Honesty note:** browsers cap `navigator.deviceMemory` at 8 — detection is a floor, not truth. Detected profiles must be labeled "detected (approximate)" in the UI, and the manual picker is the primary path (per spec §16 "Web Limitation").

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/hardware.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { RAM_OPTIONS, detectHardware } from '../../src/lib/hardware'

describe('detectHardware', () => {
  it('uses deviceMemory + cores when present', () => {
    expect(detectHardware({ deviceMemory: 8, hardwareConcurrency: 12 })).toEqual({ ramGb: 8, cores: 12, source: 'detected' })
  })
  it('returns null when nothing is detectable', () => {
    expect(detectHardware({})).toBeNull()
  })
})

describe('RAM_OPTIONS', () => {
  it('offers the standard tiers', () => {
    expect(RAM_OPTIONS).toEqual([8, 16, 32, 64, 128])
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/lib/hardware.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
export interface HardwareProfile { ramGb: number; cores: number | null; source: 'manual' | 'detected' }
export const RAM_OPTIONS = [8, 16, 32, 64, 128]
const KEY = 'irisui.hardware'

export function detectHardware(
  nav: { deviceMemory?: number; hardwareConcurrency?: number } =
    (typeof navigator !== 'undefined' ? (navigator as never) : {}),
): HardwareProfile | null {
  const ram = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0
  if (!ram) return null
  return { ramGb: ram, cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null, source: 'detected' }
}

export function loadHardwareProfile(): HardwareProfile | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<HardwareProfile>
    if (typeof p.ramGb !== 'number' || p.ramGb <= 0) return null
    return { ramGb: p.ramGb, cores: typeof p.cores === 'number' ? p.cores : null, source: p.source === 'detected' ? 'detected' : 'manual' }
  } catch { return null }
}

export function saveHardwareProfile(p: HardwareProfile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* ignore */ }
}
```

- [ ] **Step 4: Run tests + build** — `npm test && npm run build` → PASS.

---

### Task 10: Recommendation engine (`src/lib/recommend.ts`)

**Files:**
- Create: `src/lib/recommend.ts`
- Test: `tests/lib/recommend.test.ts`

**Interfaces:**
- Consumes: `MODEL_CATALOG` (`src/lib/modelCatalog.ts`).
- Produces (used by Task 11):

```ts
export type FitVerdict = 'comfortable' | 'tight' | 'too-large'
export function parseApproxGb(approxSize: string): number       // "~4.9 GB" → 4.9
export function modelFit(modelBytes: number, ramGb: number): FitVerdict
export interface Recommendation { category: string; name: string; label: string; reason: string }
export function recommendModels(ramGb: number): Recommendation[]
```

**Rules (from spec §16.6, locked):** needed RAM ≈ modelBytes × 1.2. `comfortable` ≤ 60% of RAM, `tight` ≤ 90%, else `too-large`. Size tiers: 8 GB → 1–4B, 16 GB → 3–8B, 32 GB → 7–14B, 64 GB+ → 14–32B. Categories: Best overall / Fastest / Coding / Reasoning / Low RAM — names must exist in `MODEL_CATALOG` so the existing pull flow can one-click install them.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/recommend.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MODEL_CATALOG } from '../../src/lib/modelCatalog'
import { modelFit, parseApproxGb, recommendModels } from '../../src/lib/recommend'

describe('parseApproxGb', () => {
  it('parses catalog size strings', () => {
    expect(parseApproxGb('~4.9 GB')).toBe(4.9)
    expect(parseApproxGb('~0.05 GB')).toBe(0.05)
    expect(parseApproxGb('nonsense')).toBe(0)
  })
})

describe('modelFit', () => {
  it('classifies against RAM with the 1.2x overhead rule', () => {
    expect(modelFit(4.9e9, 16)).toBe('comfortable') // needs ~5.9GB of 16
    expect(modelFit(8.3e9, 16))..toBe('tight')       // needs ~10GB of 16 (62%→90% band)
    expect(modelFit(20e9, 16)).toBe('too-large')     // needs ~24GB
  })
})

describe('recommendModels', () => {
  it('returns catalog-installable picks per category', () => {
    const recs = recommendModels(16)
    expect(recs.length).toBeGreaterThanOrEqual(4)
    const names = new Set(MODEL_CATALOG.map((m) => m.name))
    for (const r of recs) expect(names.has(r.name)).toBe(true)
    expect(recs.map((r) => r.category)).toContain('Best overall')
  })
  it('never recommends something the machine cannot run', () => {
    for (const ram of [8, 16, 32, 64]) {
      for (const r of recommendModels(ram)) {
        const m = MODEL_CATALOG.find((c) => c.name === r.name)!
        expect(modelFit(parseApproxGb(m.approxSize) * 1e9, ram)).not.toBe('too-large')
      }
    }
  })
})
```

(Note: fix the double-dot typo `..toBe` → `.toBe` when writing the file — expected content is `.toBe('tight')`. Verify 8.3 GB × 1.2 = 9.96 GB = 62% of 16 GB → `tight` per the 60%/90% bands.)

- [ ] **Step 2: Run to verify failure** — FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { MODEL_CATALOG } from './modelCatalog'

export type FitVerdict = 'comfortable' | 'tight' | 'too-large'
export interface Recommendation { category: string; name: string; label: string; reason: string }

export function parseApproxGb(approxSize: string): number {
  const m = approxSize.match(/([\d.]+)\s*GB/i)
  return m ? Number(m[1]) : 0
}

export function modelFit(modelBytes: number, ramGb: number): FitVerdict {
  const neededGb = (modelBytes / 1e9) * 1.2
  if (neededGb <= ramGb * 0.6) return 'comfortable'
  if (neededGb <= ramGb * 0.9) return 'tight'
  return 'too-large'
}

/** Picks per category, largest catalog model that still fits comfortably (or tight for "Best overall" at low RAM). */
const CATEGORY_POOLS: { category: string; reason: string; pool: string[] }[] = [
  { category: 'Best overall', reason: 'Strong general quality for this RAM tier', pool: ['qwen2.5:32b', 'qwen2.5:14b', 'llama3.1:8b', 'llama3.2:3b', 'llama3.2:1b'] },
  { category: 'Fastest', reason: 'Small and quick on modest hardware', pool: ['llama3.2:3b', 'qwen2.5:1.5b', 'llama3.2:1b', 'qwen2.5:0.5b'] },
  { category: 'Coding', reason: 'Tuned for code generation and review', pool: ['deepseek-coder-v2:16b', 'qwen2.5-coder:7b', 'qwen2.5-coder:1.5b'] },
  { category: 'Reasoning', reason: 'Distilled reasoning models', pool: ['qwq:32b', 'deepseek-r1:14b', 'deepseek-r1:7b', 'deepseek-r1:1.5b'] },
  { category: 'Low RAM', reason: 'Runs on the tightest machines', pool: ['gemma3:1b', 'qwen2.5:0.5b', 'tinyllama'] },
]

export function recommendModels(ramGb: number): Recommendation[] {
  const recs: Recommendation[] = []
  for (const { category, reason, pool } of CATEGORY_POOLS) {
    for (const name of pool) {
      const entry = MODEL_CATALOG.find((m) => m.name === name)
      if (!entry) continue
      const fit = modelFit(parseApproxGb(entry.approxSize) * 1e9, ramGb)
      if (fit === 'comfortable' || (fit === 'tight' && category === 'Best overall')) {
        recs.push({ category, name, label: entry.label, reason })
        break
      }
    }
  }
  return recs
}
```

- [ ] **Step 4: Run tests + build** — `npm test && npm run build` → PASS.

---

### Task 11: Hardware panel + fit badges in the Models page

**Files:**
- Create: `src/components/HardwarePanel.tsx`
- Modify: `src/components/ModelsPage.tsx`, `src/components/ModelRow.tsx`

**Interfaces:**
- Consumes: Tasks 9–10 APIs, existing `pull: ModelPull`, `isInstalled`.
- Produces: `HardwarePanel({ onPull, pulling, isInstalled })`; `ModelRow` gains optional `fit?: FitVerdict | null` prop.

- [ ] **Step 1: Build the panel**

Create `src/components/HardwarePanel.tsx`:

```tsx
import { useState } from 'react'
import { Cpu, Download } from 'lucide-react'
import type { HardwareProfile } from '../lib/hardware'
import { RAM_OPTIONS, detectHardware, loadHardwareProfile, saveHardwareProfile } from '../lib/hardware'
import { recommendModels } from '../lib/recommend'

export function HardwarePanel({
  onPull, pulling, isInstalled,
}: {
  onPull: (name: string) => void
  pulling: boolean
  isInstalled: (name: string) => boolean
}) {
  const [profile, setProfile] = useState<HardwareProfile | null>(() => loadHardwareProfile() ?? detectHardware())

  const pick = (ramGb: number) => {
    const next: HardwareProfile = { ramGb, cores: profile?.cores ?? null, source: 'manual' }
    setProfile(next)
    saveHardwareProfile(next)
  }

  const recs = profile ? recommendModels(profile.ramGb) : []

  return (
    <section className="mb-6 rounded-2xl border border-line bg-panel/50 p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg">
        <Cpu className="h-4 w-4 text-iris" />
        Recommended for your machine
      </h2>
      <p className="mb-3 text-xs text-muted">
        Pick your RAM — recommendations and fit badges are estimates based on model size.
        {profile?.source === 'detected' && ' (Detected — browsers under-report RAM, adjust if wrong.)'}
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {RAM_OPTIONS.map((gb) => (
          <button
            key={gb}
            onClick={() => pick(gb)}
            className={
              'rounded-full border px-3 py-1 text-xs transition ' +
              (profile?.ramGb === gb
                ? 'border-iris bg-iris/10 text-fg'
                : 'border-line text-muted hover:border-iris/40 hover:text-fg')
            }
          >
            {gb} GB{gb === 128 ? '+' : ''}
          </button>
        ))}
      </div>

      {profile && recs.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {recs.map((r) => (
            <div key={r.category} className="flex items-center gap-3 rounded-xl border border-line bg-panel2/40 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{r.category}</p>
                <p className="truncate text-sm font-medium text-fg">{r.label}</p>
                <p className="truncate text-xs text-muted">{r.reason}</p>
              </div>
              {isInstalled(r.name) ? (
                <span className="shrink-0 text-xs text-emerald-400">Installed</span>
              ) : (
                <button
                  onClick={() => onPull(r.name)}
                  disabled={pulling}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-iris/40 hover:text-fg disabled:opacity-50"
                >
                  <Download className="h-3 w-3" />
                  Pull
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Fit badges on installed models**

In `src/components/ModelRow.tsx`: add prop `fit?: FitVerdict | null` (`import type { FitVerdict } from '../lib/recommend'`). In the metadata row (after the `≈{estimatedRam(model.size)} RAM` span), render:

```tsx
            {fit && (
              <>
                <span>·</span>
                <span className={fit === 'comfortable' ? 'text-emerald-400' : fit === 'tight' ? 'text-amber-400' : 'text-rose-400'}>
                  {fit === 'comfortable' ? 'Runs well' : fit === 'tight' ? 'Tight fit' : 'Too large'}
                </span>
              </>
            )}
```

In `src/components/ModelsPage.tsx`: import `HardwarePanel`, `modelFit`, `loadHardwareProfile`. Mount `<HardwarePanel onPull={(n) => void pull.start(n)} pulling={pull.pulling} isInstalled={isInstalled} />` between the Install section and Browse section. Compute `const ramGb = loadHardwareProfile()?.ramGb ?? null` (re-read on each render is fine — the panel saves synchronously; alternatively lift the profile into `ModelsPage` state and pass a callback; either is acceptable as long as badges update after picking RAM). Pass `fit={ramGb && m.size ? modelFit(m.size, ramGb) : null}` to each `ModelRow`.

- [ ] **Step 3: Verify**

Run: `npm test && npm run build` — PASS. Playwright: open Models, click the `16 GB` chip, assert recommendation cards appear (≥ 4 categories) and each installed model row shows a fit badge; reload the page and assert the RAM choice persisted. Screenshot.

---

## Later versions — separate plans (charters)

Per scope check, each of these is an independent subsystem and gets its own plan document at kickoff. Locked decisions so far:

**v0.7 Shell (Tauri desktop).** Wrap the existing app unchanged; add `src-tauri/` with commands `ollama_status`/`ollama_start`/`ollama_stop`; implement `sqliteStore.ts` satisfying the existing `ChatStore` interface and swap in `getStore()` behind a platform check; migrate IndexedDB → SQLite on first desktop launch (read via existing `listMeta`/`get`, write via SQLite). Web build must keep working (`npm run build` unchanged). Acceptance: desktop launches, can start Ollama, chats persist in SQLite, app packages.

**v0.8 Archive (files + local RAG).** Embeddings via Ollama `/api/embed` (default `nomic-embed-text`, one-click install if missing); chunker (~500-token chunks, 50 overlap); cosine search in-memory over IndexedDB-stored vectors (web-scale: thousands of chunks); `.txt/.md/.json/.csv` first, PDF later via pdf.js; citations rendered as expandable source chips under answers. No folder scanning without explicit selection.

**v0.9 Studio.** Personas (name/icon/system prompt/default model/effort/temp — stored beside conversations, DB v3); prompt library; model arena (N side-by-side streams via existing `streamChat`, per-column stats from Task 3 metadata, user rating stored with stats); command palette (`cmdk`, Ctrl+K) + shortcuts (Ctrl+N new chat, Esc stop); voice via Web Speech API (push-to-talk, off by default); optional web search — off by default, clearly labeled, sources shown.

**v1.0 Iris (hardening).** Settings additions: Ollama host URL (replaces the hardcoded proxy target; needs runtime base-URL in `ollama.ts`), default model/effort/temperature, data export/import (full IndexedDB dump/restore via JSON), delete-all-data. Quality-bar test matrix from roadmap §11 (Ollama missing/offline/no models/model deleted mid-chat/failed pull/interrupted stream/large chats/markdown-heavy) executed as a Playwright suite. Bundle-size pass (lazy-load recharts + highlight.js languages).

## Extra feature ideas (mine — slot when adjacent work lands)

| Idea | Version | Why |
|---|---|---|
| Context-usage meter (≈ tokens used vs model context from `/api/show` `model_info` context_length) | v0.5.x | Honest, useful, uses stats pipeline |
| Scroll-to-bottom button + smarter auto-scroll (don't fight the user) | v0.5.x | Last open v0.2 polish item |
| Web Notification when a model pull finishes | v0.5.x | Pulls are long; badge already exists |
| One-click "install all recommended" | v0.6.x | Natural extension of Task 11 |
| Import chat JSON (round-trip with existing export) | v0.9 | Completes export story |
| Edit user message + resend, retry-with-different-model | v0.9 | High-value chat power features |
| Pin chats; duplicate chat; auto-title via the model itself | v0.9 | Cheap sidebar wins |
| Composer draft autosave per chat | v0.9 | Never lose a half-typed prompt |
| Model update check (compare local digest vs registry) | v1.2 | Fits Advanced Model Tools |

## Self-Review (completed)

1. **Spec coverage:** v0.5 spec items — per-message stats ✅ (T6/T7), TTFT ✅, total time ✅, tok/s ✅, prompt/completion tokens ✅ (stored; surfaced in table), load duration ✅ (stored), per-model averages ✅ (T4/T8), Stats page ✅, recent history ✅, charts (all three named ones) ✅. v0.6 items — profile screen ✅ (panel), RAM manual input ✅, CPU info ✅ (cores, best-effort), recommendations ✅, can-my-machine-run-this ✅ (fit badges), benchmark button ✅ (already shipped in v0.4 ModelRow), recommended list ✅. GPU/VRAM/disk detection — **not possible honestly in a browser; deferred to v0.7 charter (native)**, manual RAM picker is the spec-sanctioned web fallback. Brand — mark ✅, similar font ✅ (Michroma), favicon ✅.
2. **Placeholder scan:** no TBDs; all steps carry complete code. One deliberate note: the `recommend.test.ts` snippet flags its own typo fix inline.
3. **Type consistency:** `ChatStreamResult` (T3) feeds `computeStat` (T4); `GenerationStat` flows to `statsStore` (T5) and `summarizeByModel` (T8); `MessageStat` flows T4→T6→T7; `FitVerdict` flows T10→T11; `openDB`/`STATS` exports (T5) match `statsStore.ts` imports. Verified consistent.
