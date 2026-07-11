# System Monitor Panel + Custom Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live System Monitor panel docked to the right edge of IrisUI (VRAM, GPU/CPU/RAM, tokens/sec, loaded models, temp/disk/status), plus a "Custom" theme preset whose six color tokens the user picks in Settings → Appearance.

**Architecture:** True system stats come from a new Vite middleware (`GET /api/system`, nvidia-smi + Node `os`), Ollama-derived data from new `/api/ps` + `/api/version` client functions, tokens/sec from the existing stats pipeline. A `useSystemMonitor` hook polls with pause/degrade logic; the panel renders hand-rolled SVG sparklines (no recharts in the main bundle). Custom themes extend the existing CSS-custom-property system in `src/theme.ts` with a `custom` preset resolved per-token with per-var fallback.

**Tech Stack:** React 18 + TypeScript, Vite 7 (middleware plugin in TS, bundled by the config loader), Tailwind 4 tokens (`bg-panel`, `text-fg`, `border-line`, `text-iris`…), lucide-react icons, vitest (node environment — tests never touch `document`).

**Spec:** `docs/superpowers/specs/2026-07-11-system-monitor-and-custom-themes-design.md`

## Global Constraints

- **Do NOT change fonts anywhere.** No new font imports, no font-family changes. Large numerals may add `tabular-nums` only.
- **No hardcoded colors** in new UI — theme tokens only (`bg-panel`, `bg-panel2`, `border-line`, `text-fg`, `text-muted`, `text-iris`, `bg-iris`). Exception: the existing emerald/red status-dot convention (`text-emerald-400`, `bg-emerald-400`, `bg-red-400`) already used by the app.
- **recharts must NOT be imported** by any file in this plan — it stays lazy-loaded inside StatsPage only.
- **No new runtime dependencies.** One new devDependency is allowed: `@types/node`.
- Keep every file under 500 lines.
- Tests run in vitest's node environment: never reference `document` or real `localStorage` in tests — stub `localStorage` with `vi.stubGlobal`.
- Commits: conventional-commit style (`feat:`, `test:`, `docs:`). Do NOT add a `Co-Authored-By` trailer (project rule #2078).
- All work happens on branch `feat/system-monitor-and-custom-themes` cut from `main`.
- Run commands from the repo root: `C:\Users\User\Documents\irisui`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/system.ts` | Create | Client types for `/api/system`, `fetchSystemStats`, pure derivations (`vramFit`, `formatTimeLeft`, `pushSample`), monitor-open persistence |
| `src/lib/format.ts` | Modify | Add `formatGbFigure` (one-decimal GB numeral) |
| `src/lib/ollama.ts` | Modify | Add `RunningModel`, `listRunningModels`, `getOllamaVersion` |
| `scripts/systemStatsPlugin.ts` | Create | Vite plugin: `GET /api/system` (nvidia-smi, CPU delta sampler, RAM, statfs), 1 s cache; exports pure parsers for tests |
| `vite.config.ts` | Modify | Register the plugin |
| `src/hooks/useSystemMonitor.ts` | Create | Polling hook (2 s system / 5 s ps), visibility pause, degrade + slow retry, history buffers, manual refresh |
| `src/components/Sparkline.tsx` | Create | ~30-line SVG polyline sparkline |
| `src/components/SystemMonitor.tsx` | Create | The right-edge panel (all cards) |
| `src/components/TopBar.tsx` | Modify | Monitor toggle button |
| `src/App.tsx` | Modify | Render panel, persist open state, palette command |
| `src/theme.ts` | Modify | `custom` preset: `CustomThemeVars`, `customToVars`, `seedCustomFromPreset`, load/save/apply support |
| `src/hooks/useTheme.ts` | Modify | `setCustomVar`, `seedCustomFrom`, custom-aware `setPreset`/`reset` |
| `src/components/SettingsAppearance.tsx` | Modify | Custom preset card + six-token color editor |
| `tests/lib/system.test.ts` | Create | Derivations, fetch, persistence |
| `tests/lib/format-gb.test.ts` | Create | `formatGbFigure` |
| `tests/lib/ollama-ps.test.ts` | Create | `/api/ps` + `/api/version` clients |
| `tests/scripts/systemStatsPlugin.test.ts` | Create | nvidia-smi parser, CPU delta math |
| `tests/lib/theme-custom.test.ts` | Create | Custom theme resolution + persistence |

---

### Task 1: Monitor domain helpers (`src/lib/system.ts` + `format.ts`)

**Files:**
- Create: `src/lib/system.ts`
- Modify: `src/lib/format.ts` (append one function)
- Test: `tests/lib/system.test.ts`, `tests/lib/format-gb.test.ts`

**Interfaces:**
- Consumes: nothing (pure + fetch + localStorage)
- Produces (used by Tasks 4–6):
  - `interface GpuStats { name: string; utilPct: number; vramUsedMb: number; vramTotalMb: number; tempC: number }`
  - `interface SystemSnapshot { gpu: GpuStats | null; cpu: { utilPct: number; cores: number }; ram: { usedBytes: number; totalBytes: number }; disk: { freeBytes: number; totalBytes: number } | null }`
  - `fetchSystemStats(signal?: AbortSignal): Promise<SystemSnapshot>` — throws on non-OK
  - `vramFit(models: { size: number; size_vram: number }[]): { inVramBytes: number; sharedBytes: number }`
  - `formatTimeLeft(expiresAt: string | undefined, nowMs: number): string`
  - `pushSample(history: number[], value: number, cap?: number): number[]`
  - `GIB` (2^30), `loadMonitorOpen(): boolean`, `saveMonitorOpen(open: boolean): void`
  - `formatGbFigure(gb: number): string` (from `format.ts`)

- [ ] **Step 1: Create the branch**

```bash
git checkout main
git checkout -b feat/system-monitor-and-custom-themes
```

- [ ] **Step 2: Write the failing tests**

Create `tests/lib/system.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchSystemStats, formatTimeLeft, loadMonitorOpen, pushSample, saveMonitorOpen, vramFit,
} from '../../src/lib/system'

afterEach(() => vi.unstubAllGlobals())

describe('vramFit', () => {
  it('sums VRAM-resident and shared portions across models', () => {
    const fit = vramFit([
      { size: 8_000_000_000, size_vram: 7_600_000_000 },
      { size: 1_200_000_000, size_vram: 1_200_000_000 },
    ])
    expect(fit.inVramBytes).toBe(8_800_000_000)
    expect(fit.sharedBytes).toBe(400_000_000)
  })

  it('clamps size_vram larger than size (never negative shared)', () => {
    const fit = vramFit([{ size: 1_000, size_vram: 2_000 }])
    expect(fit.inVramBytes).toBe(1_000)
    expect(fit.sharedBytes).toBe(0)
  })

  it('returns zeros for an empty list', () => {
    expect(vramFit([])).toEqual({ inVramBytes: 0, sharedBytes: 0 })
  })
})

describe('formatTimeLeft', () => {
  const now = Date.parse('2026-07-11T12:00:00Z')

  it('renders minutes', () => {
    expect(formatTimeLeft('2026-07-11T12:11:00Z', now)).toBe('11m left')
  })

  it('renders hours + minutes', () => {
    expect(formatTimeLeft('2026-07-11T13:12:00Z', now)).toBe('1h 12m left')
  })

  it('renders whole hours without a minutes part', () => {
    expect(formatTimeLeft('2026-07-11T14:00:00Z', now)).toBe('2h left')
  })

  it('treats far-future expiry (keep_alive -1) as pinned', () => {
    expect(formatTimeLeft('2100-01-01T00:00:00Z', now)).toBe('pinned')
  })

  it('treats the Go zero time as pinned', () => {
    expect(formatTimeLeft('0001-01-01T00:00:00Z', now)).toBe('pinned')
  })

  it('renders <1m just before expiry', () => {
    expect(formatTimeLeft('2026-07-11T12:00:20Z', now)).toBe('<1m left')
  })

  it('returns empty string for missing or unparseable input', () => {
    expect(formatTimeLeft(undefined, now)).toBe('')
    expect(formatTimeLeft('not-a-date', now)).toBe('')
  })
})

describe('pushSample', () => {
  it('appends and caps at 30 by default', () => {
    let h: number[] = []
    for (let i = 0; i < 35; i++) h = pushSample(h, i)
    expect(h).toHaveLength(30)
    expect(h[0]).toBe(5)
    expect(h[29]).toBe(34)
  })

  it('respects a custom cap', () => {
    expect(pushSample([1, 2, 3], 4, 3)).toEqual([2, 3, 4])
  })
})

describe('fetchSystemStats', () => {
  it('returns the parsed snapshot on 200', async () => {
    const snap = {
      gpu: null, cpu: { utilPct: 28, cores: 16 },
      ram: { usedBytes: 1, totalBytes: 2 }, disk: null,
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snap), { status: 200 }),
    ))
    await expect(fetchSystemStats()).resolves.toEqual(snap)
  })

  it('throws on non-OK responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    await expect(fetchSystemStats()).rejects.toThrow('404')
  })
})

describe('monitor open persistence', () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial))
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
  }

  it('defaults to open when nothing is stored', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(loadMonitorOpen()).toBe(true)
  })

  it('round-trips a closed state', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveMonitorOpen(false)
    expect(loadMonitorOpen()).toBe(false)
  })

  it('falls back to open on corrupt JSON', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'irisui.monitor': '{nope' }))
    expect(loadMonitorOpen()).toBe(true)
  })
})
```

Create `tests/lib/format-gb.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatGbFigure } from '../../src/lib/format'

describe('formatGbFigure', () => {
  it('keeps one decimal for fractional values', () => {
    expect(formatGbFigure(8.2)).toBe('8.2')
    expect(formatGbFigure(15.3)).toBe('15.3')
  })
  it('drops the decimal for whole values', () => {
    expect(formatGbFigure(12)).toBe('12')
    expect(formatGbFigure(31.98)).toBe('32')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/lib/system.test.ts tests/lib/format-gb.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/system'` and `formatGbFigure` not exported.

- [ ] **Step 4: Write the implementation**

Create `src/lib/system.ts`:

```ts
/**
 * Client side of the System Monitor. `/api/system` is served by the Vite
 * middleware in scripts/systemStatsPlugin.ts (dev + preview only) — when the
 * app is hosted without it, fetchSystemStats rejects and the panel degrades
 * to Ollama-derived data.
 */

export interface GpuStats {
  name: string
  utilPct: number
  vramUsedMb: number
  vramTotalMb: number
  tempC: number
}

export interface SystemSnapshot {
  gpu: GpuStats | null
  cpu: { utilPct: number; cores: number }
  ram: { usedBytes: number; totalBytes: number }
  disk: { freeBytes: number; totalBytes: number } | null
}

export const GIB = 2 ** 30

export async function fetchSystemStats(signal?: AbortSignal): Promise<SystemSnapshot> {
  const res = await fetch('/api/system', { signal })
  if (!res.ok) throw new Error(`system stats unavailable (${res.status})`)
  return (await res.json()) as SystemSnapshot
}

/** Split loaded models' memory into GPU-resident vs spilled-to-RAM bytes. */
export function vramFit(
  models: { size: number; size_vram: number }[],
): { inVramBytes: number; sharedBytes: number } {
  let inVramBytes = 0
  let sharedBytes = 0
  for (const m of models) {
    const size = m.size > 0 ? m.size : 0
    const inVram = Math.max(0, Math.min(m.size_vram, size))
    inVramBytes += inVram
    sharedBytes += size - inVram
  }
  return { inVramBytes, sharedBytes }
}

const TEN_YEARS_MS = 10 * 365 * 24 * 3600 * 1000

/**
 * Countdown label for Ollama's expires_at. keep_alive -1 reports a far-future
 * timestamp and the Go zero time is far past — both mean "not scheduled to
 * unload", rendered as "pinned".
 */
export function formatTimeLeft(expiresAt: string | undefined, nowMs: number): string {
  if (!expiresAt) return ''
  const t = Date.parse(expiresAt)
  if (Number.isNaN(t)) return ''
  const delta = t - nowMs
  if (delta > TEN_YEARS_MS || delta < -60_000) return 'pinned'
  if (delta < 60_000) return '<1m left'
  const mins = Math.floor(delta / 60_000)
  if (mins < 60) return `${mins}m left`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m left` : `${h}h left`
}

/** Rolling sample buffer for sparklines (immutable, capped). */
export function pushSample(history: number[], value: number, cap = 30): number[] {
  const next = [...history, value]
  return next.length > cap ? next.slice(next.length - cap) : next
}

// ── panel open/closed persistence ─────────────────────────────────────────
const MONITOR_KEY = 'irisui.monitor'

export function loadMonitorOpen(): boolean {
  try {
    const raw = localStorage.getItem(MONITOR_KEY)
    if (!raw) return true
    return (JSON.parse(raw) as { open?: boolean }).open !== false
  } catch {
    return true
  }
}

export function saveMonitorOpen(open: boolean): void {
  try {
    localStorage.setItem(MONITOR_KEY, JSON.stringify({ open }))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
```

Append to `src/lib/format.ts`:

```ts
/** One-decimal GB numeral for "8.2 / 12 GB" pairs; whole values drop the decimal. */
export function formatGbFigure(gb: number): string {
  const v = Math.round(gb * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/system.test.ts tests/lib/format-gb.test.ts`
Expected: PASS (all).

Note on the `11m left` test: `Date.parse('2026-07-11T12:11:00Z') - now` is exactly 660 000 ms → `floor(660000/60000) = 11`. The `<1m` boundary is `delta < 60_000`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/system.ts src/lib/format.ts tests/lib/system.test.ts tests/lib/format-gb.test.ts
git commit -m "feat(monitor): system snapshot types, VRAM-fit math, countdown + sparkline helpers"
```

---

### Task 2: Ollama `/api/ps` + `/api/version` clients

**Files:**
- Modify: `src/lib/ollama.ts` (append after the `fetchModels` function, before `ChatStreamResult`)
- Test: `tests/lib/ollama-ps.test.ts`

**Interfaces:**
- Consumes: existing `getOllamaBase()` from the same module.
- Produces (used by Tasks 4–5):
  - `interface RunningModel { name: string; size: number; size_vram: number; expires_at?: string }`
  - `listRunningModels(signal?: AbortSignal): Promise<RunningModel[]>` — throws on non-OK / network error, returns `[]` on malformed body
  - `getOllamaVersion(signal?: AbortSignal): Promise<string>` — throws on non-OK, `''` on malformed body

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/ollama-ps.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getOllamaVersion, listRunningModels } from '../../src/lib/ollama'

afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

describe('listRunningModels', () => {
  it('parses name, size, size_vram and expires_at', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      models: [{
        name: 'qwen2.5:7b', size: 8_000_000_000, size_vram: 7_600_000_000,
        expires_at: '2026-07-11T12:11:00Z', digest: 'abc',
      }],
    })))
    const models = await listRunningModels()
    expect(models).toEqual([{
      name: 'qwen2.5:7b', size: 8_000_000_000, size_vram: 7_600_000_000,
      expires_at: '2026-07-11T12:11:00Z',
    }])
  })

  it('defaults missing numeric fields to 0 and drops nameless entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      models: [{ name: 'a' }, { size: 5 }],
    })))
    expect(await listRunningModels()).toEqual([{ name: 'a', size: 0, size_vram: 0, expires_at: undefined }])
  })

  it('returns [] when models is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({})))
    expect(await listRunningModels()).toEqual([])
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 500)))
    await expect(listRunningModels()).rejects.toThrow('500')
  })
})

describe('getOllamaVersion', () => {
  it('returns the version string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ version: '0.2.7' })))
    expect(await getOllamaVersion()).toBe('0.2.7')
  })

  it('returns empty string when the field is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({})))
    expect(await getOllamaVersion()).toBe('')
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 503)))
    await expect(getOllamaVersion()).rejects.toThrow('503')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/ollama-ps.test.ts`
Expected: FAIL — `listRunningModels`/`getOllamaVersion` are not exported.

- [ ] **Step 3: Implement**

In `src/lib/ollama.ts`, insert after `fetchModels` (line 30) and before the `ChatStreamResult` interface:

```ts
export interface RunningModel {
  name: string
  size: number       // total memory footprint in bytes
  size_vram: number  // portion resident in GPU VRAM, bytes
  expires_at?: string
}

/** GET /api/ps — models currently loaded in memory. Throws if Ollama is unreachable. */
export async function listRunningModels(signal?: AbortSignal): Promise<RunningModel[]> {
  const res = await fetch(`${getOllamaBase()}/api/ps`, { signal })
  if (!res.ok) throw new Error(`Ollama responded with ${res.status}`)
  const data: unknown = await res.json()
  const models = (data as { models?: unknown })?.models
  if (!Array.isArray(models)) return []
  return (models as Record<string, unknown>[])
    .map((m) => ({
      name: typeof m.name === 'string' ? m.name : '',
      size: typeof m.size === 'number' ? m.size : 0,
      size_vram: typeof m.size_vram === 'number' ? m.size_vram : 0,
      expires_at: typeof m.expires_at === 'string' ? m.expires_at : undefined,
    }))
    .filter((m) => m.name)
}

/** GET /api/version — Ollama server version. Throws if unreachable. */
export async function getOllamaVersion(signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${getOllamaBase()}/api/version`, { signal })
  if (!res.ok) throw new Error(`Ollama responded with ${res.status}`)
  const data = (await res.json()) as { version?: unknown }
  return typeof data.version === 'string' ? data.version : ''
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/ollama-ps.test.ts`
Expected: PASS. Also run `npx vitest run tests/lib/ctx-ollama.test.ts` — the existing ollama tests must still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ollama.ts tests/lib/ollama-ps.test.ts
git commit -m "feat(ollama): /api/ps and /api/version clients for the system monitor"
```

---

### Task 3: `/api/system` Vite middleware plugin

**Files:**
- Create: `scripts/systemStatsPlugin.ts`
- Modify: `vite.config.ts`
- Modify: `package.json` (add `@types/node` devDependency via npm)
- Test: `tests/scripts/systemStatsPlugin.test.ts`

**Interfaces:**
- Consumes: Node built-ins only (`node:os`, `node:child_process`, `node:fs`, `node:fs/promises`, `node:path`).
- Produces:
  - `systemStatsPlugin(): Plugin` — registered in `vite.config.ts`; serves `GET /api/system` returning the exact `SystemSnapshot` JSON shape from Task 1.
  - Pure, exported for tests: `parseNvidiaSmi(line: string): GpuLike | null`, `cpuUtilBetween(prev: CpuTimes[], next: CpuTimes[]): number`.

Notes for the implementer:
- `vite.config.ts` is bundled by Vite's config loader (esbuild), so it can import a local **TypeScript** file — no `.mjs` needed.
- The middleware must never crash the dev server: every collector is wrapped, failures become `null` fields.
- `nvidia-smi` must be invoked at most once per second — enforced by the 1 s snapshot cache.

- [ ] **Step 1: Install @types/node**

```bash
npm install -D @types/node
```

- [ ] **Step 2: Write the failing tests**

Create `tests/scripts/systemStatsPlugin.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cpuUtilBetween, parseNvidiaSmi } from '../../scripts/systemStatsPlugin'

describe('parseNvidiaSmi', () => {
  it('parses a nounits CSV line', () => {
    expect(parseNvidiaSmi('NVIDIA GeForce RTX 3060, 62, 8396, 12288, 58')).toEqual({
      name: 'NVIDIA GeForce RTX 3060',
      utilPct: 62, vramUsedMb: 8396, vramTotalMb: 12288, tempC: 58,
    })
  })

  it('returns null for a short or empty line', () => {
    expect(parseNvidiaSmi('')).toBeNull()
    expect(parseNvidiaSmi('name, 1, 2')).toBeNull()
  })

  it('returns null when a numeric field is not a number', () => {
    expect(parseNvidiaSmi('GPU, N/A, 8396, 12288, 58')).toBeNull()
  })
})

describe('cpuUtilBetween', () => {
  const cpu = (user: number, idle: number) => ({ user, nice: 0, sys: 0, idle, irq: 0 })

  it('computes busy percentage from time deltas', () => {
    const prev = [cpu(100, 100), cpu(100, 100)]
    const next = [cpu(150, 150), cpu(200, 100)]
    // deltas: core0 busy 50 idle 50, core1 busy 100 idle 0 → busy 150 / total 200 = 75%
    expect(cpuUtilBetween(prev, next)).toBe(75)
  })

  it('returns 0 when there is no previous sample or no elapsed time', () => {
    expect(cpuUtilBetween([], [cpu(1, 1)])).toBe(0)
    expect(cpuUtilBetween([cpu(1, 1)], [cpu(1, 1)])).toBe(0)
  })

  it('clamps into 0..100', () => {
    expect(cpuUtilBetween([cpu(0, 100)], [cpu(0, 200)])).toBe(0)
    expect(cpuUtilBetween([cpu(0, 100)], [cpu(500, 100)])).toBe(100)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/scripts/systemStatsPlugin.test.ts`
Expected: FAIL — `Cannot find module '../../scripts/systemStatsPlugin'`.

- [ ] **Step 4: Implement the plugin**

Create `scripts/systemStatsPlugin.ts`:

```ts
/**
 * GET /api/system — true hardware stats for the System Monitor panel.
 *
 * Served as Vite middleware in dev AND preview. A static production host
 * won't have it; the client detects the 404/network error and degrades to
 * Ollama-derived data only. All collectors are best-effort: any failure
 * turns that field into null rather than a 500.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface CpuTimes { user: number; nice: number; sys: number; idle: number; irq: number }

interface GpuLike { name: string; utilPct: number; vramUsedMb: number; vramTotalMb: number; tempC: number }

/** Parse one line of `nvidia-smi --format=csv,noheader,nounits` output. */
export function parseNvidiaSmi(line: string): GpuLike | null {
  const parts = line.split(',').map((s) => s.trim())
  if (parts.length < 5) return null
  const [name, util, used, total, temp] = parts
  const nums = [util, used, total, temp].map(Number)
  if (!name || nums.some((n) => !Number.isFinite(n))) return null
  return { name, utilPct: nums[0], vramUsedMb: nums[1], vramTotalMb: nums[2], tempC: nums[3] }
}

/** Busy percentage between two os.cpus() samples (per-core time deltas). */
export function cpuUtilBetween(prev: CpuTimes[], next: CpuTimes[]): number {
  let busy = 0
  let total = 0
  for (let i = 0; i < next.length; i++) {
    const p = prev[i]
    if (!p) continue
    const n = next[i]
    const dTotal = n.user + n.nice + n.sys + n.idle + n.irq - (p.user + p.nice + p.sys + p.idle + p.irq)
    const dIdle = n.idle - p.idle
    total += dTotal
    busy += dTotal - dIdle
  }
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((busy / total) * 100)))
}

const cpuTimes = (): CpuTimes[] => os.cpus().map((c) => c.times)

function queryGpu(): Promise<GpuLike | null> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
       '--format=csv,noheader,nounits'],
      { timeout: 3000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null)
        resolve(parseNvidiaSmi(stdout.split('\n')[0] ?? ''))
      },
    )
  })
}

function modelsDir(): string {
  const custom = process.env.OLLAMA_MODELS
  if (custom && existsSync(custom)) return custom
  const dflt = join(os.homedir(), '.ollama', 'models')
  return existsSync(dflt) ? dflt : os.homedir()
}

async function queryDisk(): Promise<{ freeBytes: number; totalBytes: number } | null> {
  try {
    const s = await statfs(modelsDir())
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize }
  } catch {
    return null
  }
}

// Snapshot cache: at most one collection (and one nvidia-smi spawn) per second,
// shared across all requests. CPU % needs two samples, so the previous call's
// sample is kept between snapshots.
let lastCpuSample = cpuTimes()
let cached: { at: number; body: string } | null = null
let inflight: Promise<string> | null = null

async function collect(): Promise<string> {
  const [gpu, disk] = await Promise.all([queryGpu(), queryDisk()])
  const nextCpu = cpuTimes()
  const snapshot = {
    gpu,
    cpu: { utilPct: cpuUtilBetween(lastCpuSample, nextCpu), cores: nextCpu.length },
    ram: { usedBytes: os.totalmem() - os.freemem(), totalBytes: os.totalmem() },
    disk,
  }
  lastCpuSample = nextCpu
  return JSON.stringify(snapshot)
}

async function getSnapshot(): Promise<string> {
  if (cached && Date.now() - cached.at < 1000) return cached.body
  inflight ??= collect()
    .then((body) => {
      cached = { at: Date.now(), body }
      return body
    })
    .finally(() => { inflight = null })
  return inflight
}

function middleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (!req.url?.startsWith('/api/system')) return next()
  getSnapshot()
    .then((body) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(body)
    })
    .catch(() => {
      res.statusCode = 500
      res.end('{}')
    })
}

export function systemStatsPlugin(): Plugin {
  return {
    name: 'iris-system-stats',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}
```

Modify `vite.config.ts` — add the import and register the plugin:

```ts
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { systemStatsPlugin } from './scripts/systemStatsPlugin'
```

and change the plugins line to:

```ts
  plugins: [react(), tailwindcss(), systemStatsPlugin()],
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/scripts/systemStatsPlugin.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the endpoint live**

```bash
npm run dev &
sleep 6
curl -s http://localhost:5173/api/system
```

Expected: one JSON object with `gpu` (object on this NVIDIA machine), `cpu.utilPct` 0–100, `cpu.cores` > 0, `ram.totalBytes` > 0, `disk` object or null. Call it twice more — responses within the same second must be identical (cache). Then stop the dev server (bring the job to foreground and Ctrl+C, or kill the node process).

- [ ] **Step 7: Commit**

```bash
git add scripts/systemStatsPlugin.ts vite.config.ts tests/scripts/systemStatsPlugin.test.ts package.json package-lock.json
git commit -m "feat(monitor): /api/system Vite middleware (nvidia-smi, CPU delta, RAM, disk)"
```

---

### Task 4: `useSystemMonitor` polling hook

**Files:**
- Create: `src/hooks/useSystemMonitor.ts`

**Interfaces:**
- Consumes: `fetchSystemStats`, `pushSample`, `SystemSnapshot` (Task 1); `listRunningModels`, `getOllamaVersion`, `isAbortError`, `RunningModel` (Task 2).
- Produces (used by Task 5):

```ts
export interface SystemMonitorData {
  system: SystemSnapshot | null
  systemAvailable: boolean
  running: RunningModel[]
  ollamaUp: boolean
  ollamaVersion: string
  gpuHistory: number[]
  cpuHistory: number[]
  lastUpdated: number | null
  refresh: () => void
}
export function useSystemMonitor(opts: { isStreaming: boolean }): SystemMonitorData
```

The polling behavior itself is exercised manually (Task 6) — its pure parts (`pushSample`, fetchers) are already unit-tested. No hook-render test: the repo has no jsdom/react-testing-library and we are not adding dependencies for it.

- [ ] **Step 1: Implement the hook**

Create `src/hooks/useSystemMonitor.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import type { RunningModel } from '../lib/ollama'
import { getOllamaVersion, isAbortError, listRunningModels } from '../lib/ollama'
import type { SystemSnapshot } from '../lib/system'
import { fetchSystemStats, pushSample } from '../lib/system'

export interface SystemMonitorData {
  system: SystemSnapshot | null
  systemAvailable: boolean
  running: RunningModel[]
  ollamaUp: boolean
  ollamaVersion: string
  gpuHistory: number[]
  cpuHistory: number[]
  lastUpdated: number | null
  refresh: () => void
}

const SYSTEM_POLL_MS = 2_000
const SYSTEM_RETRY_MS = 30_000 // slow retry once the endpoint has proven absent
const PS_POLL_MS = 5_000

/**
 * Polls /api/system (2 s) and Ollama /api/ps (5 s) while the tab is visible.
 * The panel unmounts when collapsed, so mount = polling on. A failing
 * /api/system flips systemAvailable and backs off to a 30 s retry; a failing
 * /api/ps marks Ollama offline. isStreaming is a poll-now signal so the
 * loaded-models list reacts to generations starting/finishing.
 */
export function useSystemMonitor({ isStreaming }: { isStreaming: boolean }): SystemMonitorData {
  const [system, setSystem] = useState<SystemSnapshot | null>(null)
  const [systemAvailable, setSystemAvailable] = useState(true)
  const [running, setRunning] = useState<RunningModel[]>([])
  const [ollamaUp, setOllamaUp] = useState(false)
  const [ollamaVersion, setOllamaVersion] = useState('')
  const [gpuHistory, setGpuHistory] = useState<number[]>([])
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // /api/system loop
  useEffect(() => {
    if (!visible) return
    const ctrl = new AbortController()
    let stopped = false
    const poll = async () => {
      try {
        const snap = await fetchSystemStats(ctrl.signal)
        if (stopped) return
        setSystem(snap)
        setSystemAvailable(true)
        if (snap.gpu) setGpuHistory((h) => pushSample(h, snap.gpu!.utilPct))
        setCpuHistory((h) => pushSample(h, snap.cpu.utilPct))
        setLastUpdated(Date.now())
      } catch (err) {
        if (stopped || isAbortError(err)) return
        setSystem(null)
        setSystemAvailable(false)
      }
    }
    void poll()
    const id = window.setInterval(() => void poll(), systemAvailable ? SYSTEM_POLL_MS : SYSTEM_RETRY_MS)
    return () => {
      stopped = true
      ctrl.abort()
      window.clearInterval(id)
    }
  }, [visible, systemAvailable, tick])

  // Ollama /api/ps loop — isStreaming in deps forces an immediate poll on
  // generation start/finish (model may have just loaded or switched).
  useEffect(() => {
    if (!visible) return
    const ctrl = new AbortController()
    let stopped = false
    const poll = async () => {
      try {
        const models = await listRunningModels(ctrl.signal)
        if (stopped) return
        setRunning(models)
        setOllamaUp(true)
        setLastUpdated(Date.now())
      } catch (err) {
        if (stopped || isAbortError(err)) return
        setRunning([])
        setOllamaUp(false)
      }
    }
    void poll()
    const id = window.setInterval(() => void poll(), PS_POLL_MS)
    return () => {
      stopped = true
      ctrl.abort()
      window.clearInterval(id)
    }
  }, [visible, isStreaming, tick])

  // Version once per offline→online transition.
  useEffect(() => {
    if (!ollamaUp) return
    let cancelled = false
    getOllamaVersion()
      .then((v) => { if (!cancelled) setOllamaVersion(v) })
      .catch(() => { /* version is cosmetic — ignore */ })
    return () => { cancelled = true }
  }, [ollamaUp])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  return {
    system, systemAvailable, running, ollamaUp, ollamaVersion,
    gpuHistory, cpuHistory, lastUpdated, refresh,
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: `tsc` and `vite build` succeed (the hook is not yet imported anywhere — that's fine, it must simply typecheck).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSystemMonitor.ts
git commit -m "feat(monitor): useSystemMonitor polling hook with visibility pause and degrade"
```

---

### Task 5: `Sparkline` + `SystemMonitor` panel component

**Files:**
- Create: `src/components/Sparkline.tsx`
- Create: `src/components/SystemMonitor.tsx`

**Interfaces:**
- Consumes: `useSystemMonitor` (Task 4), `vramFit`/`formatTimeLeft`/`pushSample`/`GIB` (Task 1), `formatBytes`/`formatGbFigure` (format.ts), `RunningModel` (Task 2), `MessageStat` (`src/lib/stats.ts`), `listStats` (`src/lib/statsStore.ts`).
- Produces (used by Task 6):

```ts
export function SystemMonitor(props: {
  selectedModel: string
  isStreaming: boolean
  lastStat?: MessageStat
  onCollapse: () => void
}): JSX.Element
```

- [ ] **Step 1: Create the Sparkline**

Create `src/components/Sparkline.tsx`:

```tsx
/**
 * Minimal SVG sparkline. Deliberately hand-rolled: recharts stays lazy-loaded
 * inside StatsPage; the monitor ships in the main bundle and must stay light.
 */
export function Sparkline({ values, height = 28 }: { values: number[]; height?: number }) {
  const width = 120
  if (values.length < 2) {
    return <div style={{ height }} aria-hidden />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - 2 - ((v - min) / range) * (height - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full text-iris"
      style={{ height }}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  )
}
```

- [ ] **Step 2: Create the panel**

Create `src/components/SystemMonitor.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronUp, Clock, HardDrive, RefreshCw, Thermometer } from 'lucide-react'
import type { MessageStat } from '../lib/stats'
import { listStats } from '../lib/statsStore'
import { useSystemMonitor } from '../hooks/useSystemMonitor'
import { GIB, formatTimeLeft, pushSample, vramFit } from '../lib/system'
import { formatBytes, formatGbFigure } from '../lib/format'
import { Sparkline } from './Sparkline'

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={'rounded-xl border border-line bg-panel2/40 p-3 ' + className}>{children}</div>
}

function CardLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-[11px] font-medium text-muted">{children}</p>
}

function Bar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full bg-iris transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-muted">{Math.round(clamped)}%</span>
    </div>
  )
}

export function SystemMonitor({
  selectedModel, isStreaming, lastStat, onCollapse,
}: {
  selectedModel: string
  isStreaming: boolean
  lastStat?: MessageStat
  onCollapse: () => void
}) {
  const mon = useSystemMonitor({ isStreaming })

  // Tokens/sec history: seed from the stats store (last 20 completed
  // generations), then append as each new response finishes. lastStat's object
  // identity changes exactly once per completed generation.
  const [tpsHistory, setTpsHistory] = useState<number[]>([])
  useEffect(() => {
    let cancelled = false
    void listStats(20).then((stats) => {
      if (cancelled) return
      setTpsHistory(stats.map((s) => s.tokensPerSec).filter((n) => n > 0).reverse())
    }).catch(() => { /* stats are best-effort */ })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (lastStat && lastStat.tokensPerSec > 0) {
      setTpsHistory((h) => pushSample(h, lastStat.tokensPerSec, 20))
    }
  }, [lastStat])

  const gpu = mon.system?.gpu ?? null
  const fit = vramFit(mon.running)
  const totalLoaded = mon.running.reduce((sum, m) => sum + m.size, 0)
  const now = Date.now()
  const lastTps = tpsHistory.length > 0 ? tpsHistory[tpsHistory.length - 1] : null

  return (
    <aside className="hidden h-full w-80 shrink-0 flex-col border-l border-line bg-panel lg:flex">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">System Monitor</h2>
        <button
          onClick={onCollapse}
          aria-label="Collapse system monitor"
          className="rounded-lg p-1.5 text-muted transition hover:bg-panel2 hover:text-fg"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* Hero: VRAM when GPU stats exist, model-memory fallback otherwise */}
        {gpu ? (
          <Card>
            <CardLabel>
              VRAM{' '}
              <span
                className="text-muted/70"
                title="How much of the GPU's memory is in use. 'Model fit' shows how much of the loaded models sits in VRAM vs spilled to system RAM — spilling slows generation dramatically."
              >
                ({gpu.name})
              </span>
            </CardLabel>
            <p className="text-2xl font-semibold tabular-nums text-fg">
              {formatGbFigure(gpu.vramUsedMb / 1024)}
              <span className="text-sm font-normal text-muted"> / {formatGbFigure(gpu.vramTotalMb / 1024)} GB</span>
            </p>
            <div className="mt-2">
              <Bar pct={gpu.vramTotalMb > 0 ? (gpu.vramUsedMb / gpu.vramTotalMb) * 100 : 0} />
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {fit.inVramBytes > 0 || fit.sharedBytes > 0
                ? `Model fit: ${formatBytes(fit.inVramBytes)} in VRAM${
                    fit.sharedBytes > 0 ? ` + ${formatBytes(fit.sharedBytes)} shared` : ''
                  }`
                : 'No models loaded'}
            </p>
          </Card>
        ) : mon.running.length > 0 ? (
          <Card>
            <CardLabel>Model memory</CardLabel>
            <p className="text-2xl font-semibold tabular-nums text-fg">
              {formatGbFigure(totalLoaded / GIB)}
              <span className="text-sm font-normal text-muted"> GB</span>
            </p>
            <p className="mt-1 text-[11px] text-muted">
              across {mon.running.length} loaded model{mon.running.length === 1 ? '' : 's'}
            </p>
          </Card>
        ) : null}

        {/* 2-up utilization grid */}
        <div className="grid grid-cols-2 gap-3">
          {gpu && (
            <Card>
              <CardLabel>GPU Utilization</CardLabel>
              <p className="text-xl font-semibold tabular-nums text-fg">{gpu.utilPct}%</p>
              <Sparkline values={mon.gpuHistory} />
            </Card>
          )}
          {mon.system && (
            <Card>
              <CardLabel>RAM Usage</CardLabel>
              <p className="text-xl font-semibold tabular-nums text-fg">
                {formatGbFigure(mon.system.ram.usedBytes / GIB)}
                <span className="text-xs font-normal text-muted">
                  {' '}/ {formatGbFigure(mon.system.ram.totalBytes / GIB)} GB
                </span>
              </p>
              <div className="mt-2">
                <Bar
                  pct={mon.system.ram.totalBytes > 0
                    ? (mon.system.ram.usedBytes / mon.system.ram.totalBytes) * 100
                    : 0}
                />
              </div>
            </Card>
          )}
          {mon.system && (
            <Card>
              <CardLabel>CPU Utilization</CardLabel>
              <p className="text-xl font-semibold tabular-nums text-fg">{mon.system.cpu.utilPct}%</p>
              <Sparkline values={mon.cpuHistory} />
            </Card>
          )}
          <Card>
            <CardLabel>Tokens / sec</CardLabel>
            <p className="text-xl font-semibold tabular-nums text-fg">
              {lastTps !== null ? lastTps.toFixed(1) : '—'}
              {lastTps !== null && <span className="text-xs font-normal text-muted"> t/s</span>}
            </p>
            <Sparkline values={tpsHistory} />
          </Card>
        </div>

        {/* Loaded models */}
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <p className="text-xs font-semibold text-fg">Loaded Models</p>
            <p className="text-[11px] text-muted">
              {mon.running.length > 0
                ? `${mon.running.length} model${mon.running.length === 1 ? '' : 's'} · ${formatBytes(totalLoaded)}`
                : mon.ollamaUp ? 'none' : '—'}
            </p>
          </div>
          {mon.running.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted">
              {mon.ollamaUp ? 'No models loaded' : 'Ollama is offline'}
            </p>
          ) : (
            <ul>
              {mon.running.map((m) => (
                <li
                  key={m.name}
                  className="flex items-center gap-2 border-b border-line px-3 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-xs font-medium text-fg">
                      <span className="truncate">{m.name}</span>
                      {m.name === selectedModel && (
                        <span className="shrink-0 rounded bg-iris/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-iris">
                          Active
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted">{formatBytes(m.size)}</p>
                  </div>
                  <p className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted">
                    <Clock className="h-3 w-3" />
                    {formatTimeLeft(m.expires_at, now) || '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Mini-card row */}
        <div className="grid grid-cols-3 gap-3">
          {gpu && (
            <Card className="p-2.5">
              <CardLabel>GPU Temp</CardLabel>
              <p className="flex items-center gap-1 text-sm font-semibold tabular-nums text-fg">
                <Thermometer className="h-3.5 w-3.5 text-muted" />
                {gpu.tempC} °C
              </p>
            </Card>
          )}
          {mon.system?.disk && (
            <Card className="p-2.5">
              <CardLabel>Disk Free</CardLabel>
              <p className="flex items-center gap-1 text-sm font-semibold tabular-nums text-fg">
                <HardDrive className="h-3.5 w-3.5 text-muted" />
                {formatGbFigure(mon.system.disk.freeBytes / GIB)} GB
              </p>
              <p className="text-[10px] text-muted">Models drive</p>
            </Card>
          )}
          <Card className="p-2.5">
            <CardLabel>Ollama</CardLabel>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <span
                className={
                  'h-1.5 w-1.5 shrink-0 rounded-full ' + (mon.ollamaUp ? 'bg-emerald-400' : 'bg-red-400')
                }
              />
              {mon.ollamaUp ? 'Running' : 'Offline'}
            </p>
            {mon.ollamaUp && mon.ollamaVersion && (
              <p className="text-[10px] tabular-nums text-muted">v{mon.ollamaVersion}</p>
            )}
          </Card>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line px-4 py-2.5">
        <p className="text-[11px] tabular-nums text-muted">
          {mon.lastUpdated ? `Last updated: ${new Date(mon.lastUpdated).toLocaleTimeString()}` : 'Waiting for data…'}
        </p>
        <button
          onClick={mon.refresh}
          aria-label="Refresh now"
          className="rounded-lg p-1.5 text-muted transition hover:bg-panel2 hover:text-fg"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: success (component not yet mounted — Task 6 wires it in).

- [ ] **Step 4: Commit**

```bash
git add src/components/Sparkline.tsx src/components/SystemMonitor.tsx
git commit -m "feat(monitor): SystemMonitor panel with SVG sparklines"
```

---

### Task 6: Mount the panel — App, TopBar, command palette

**Files:**
- Modify: `src/components/TopBar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `SystemMonitor` (Task 5), `loadMonitorOpen`/`saveMonitorOpen` (Task 1).
- Produces: `TopBar` gains `onToggleMonitor: () => void` prop.

- [ ] **Step 1: Add the toggle button to TopBar**

Replace `src/components/TopBar.tsx` content with:

```tsx
import { Gauge, Menu, Settings } from 'lucide-react'

export function TopBar({
  onToggleSidebar,
  onToggleMonitor,
  onOpenSettings,
  title,
  showTitle,
}: {
  onToggleSidebar: () => void
  onToggleMonitor: () => void
  onOpenSettings: () => void
  title: string
  showTitle: boolean
}) {
  return (
    <header className="relative flex items-center justify-between px-3 py-2.5">
      <button
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        className="rounded-lg p-2 text-muted transition hover:bg-panel hover:text-fg"
      >
        <Menu className="h-5 w-5" />
      </button>

      {showTitle && (
        <div className="pointer-events-none absolute inset-x-0 mx-auto max-w-[50%] truncate text-center text-sm font-medium text-fg/90">
          {title}
        </div>
      )}

      <div className="flex items-center">
        <button
          onClick={onToggleMonitor}
          aria-label="Toggle system monitor"
          className="hidden rounded-lg p-2 text-muted transition hover:bg-panel hover:text-fg lg:block"
        >
          <Gauge className="h-5 w-5" />
        </button>
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="rounded-lg p-2 text-muted transition hover:bg-panel hover:text-fg"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
```

(The monitor toggle is `hidden lg:block` because the panel itself only exists at `lg:` and up.)

- [ ] **Step 2: Wire the panel into App**

In `src/App.tsx`:

a. Add imports (`Gauge` joins the existing lucide import list; new module imports after the existing component imports):

```ts
import { Gauge } from 'lucide-react'          // merge into the existing lucide-react import
import { SystemMonitor } from './components/SystemMonitor'
import { loadMonitorOpen, saveMonitorOpen } from './lib/system'
```

b. Add state next to `sidebarOpen` (after the `const [sidebarOpen, setSidebarOpen] = useState(true)` line):

```ts
const [monitorOpen, setMonitorOpen] = useState<boolean>(() => loadMonitorOpen())
useEffect(() => {
  saveMonitorOpen(monitorOpen)
}, [monitorOpen])
```

(`useEffect` joins the existing react import.)

c. Add the palette command after the `toggle-sidebar` entry:

```ts
{
  id: 'toggle-monitor',
  label: 'Toggle system monitor',
  icon: Gauge,
  run: () => setMonitorOpen((o) => !o),
},
```

d. Pass the toggle to TopBar:

```tsx
<TopBar
  onToggleSidebar={() => setSidebarOpen((o) => !o)}
  onToggleMonitor={() => setMonitorOpen((o) => !o)}
  onOpenSettings={() => setSettingsOpen(true)}
  ...
```

e. Render the panel after `</main>` (immediately before `<SettingsModal`):

```tsx
{monitorOpen && (
  <SystemMonitor
    selectedModel={chat.selectedModel}
    isStreaming={chat.isStreaming}
    lastStat={lastAssistantStat}
    onCollapse={() => setMonitorOpen(false)}
  />
)}
```

- [ ] **Step 3: Verify end-to-end**

Run: `npm run build` — expected: success.
Run: `npm run dev:ollama`, open http://localhost:5173, and check:
1. Panel appears on the right with VRAM/GPU/RAM/CPU cards showing plausible live numbers (compare against `nvidia-smi` in another terminal).
2. Send a chat message → Tokens/sec card updates when the response finishes; the model appears under Loaded Models with an `ACTIVE` badge and a countdown.
3. Chevron collapses the panel; Gauge button in the TopBar and "Toggle system monitor" in the command palette (Ctrl+K) reopen it; reload the page — the open/closed state is remembered.
4. Narrow the window below 1024 px → panel disappears.
5. Stop Ollama (`taskkill /IM ollama.exe /F` or quit the tray app) → Ollama card shows red `Offline`, loaded list shows the offline note, system cards keep updating. Restart Ollama afterwards.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TopBar.tsx src/App.tsx
git commit -m "feat(monitor): mount right-edge System Monitor with toggle + persistence"
```

---

### Task 7: Custom theme model (`src/theme.ts`)

**Files:**
- Modify: `src/theme.ts`
- Test: `tests/lib/theme-custom.test.ts`

**Interfaces:**
- Consumes: existing `PRESETS`, `isValidHex`, `normalizeHex`, `luminance` (already in the module).
- Produces (used by Task 8):
  - `type ThemePreset = 'light' | 'dark' | 'wine' | 'custom'`
  - `interface CustomThemeVars { bg: string; panel: string; panel2: string; line: string; fg: string; muted: string }`
  - `ThemeSettings` gains `custom?: Partial<CustomThemeVars>`
  - `CUSTOM_TOKEN_LABELS: { key: keyof CustomThemeVars; label: string }[]`
  - `customToVars(custom: Partial<CustomThemeVars> | undefined): { vars: Record<string, string>; scheme: 'light' | 'dark' }` — per-var fallback to the dark preset, scheme from bg luminance
  - `seedCustomFromPreset(preset: Exclude<ThemePreset, 'custom'>): CustomThemeVars`
  - `applyTheme`/`loadTheme`/`saveTheme` handle the custom preset

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/theme-custom.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_THEME, PRESETS, customToVars, loadTheme, saveTheme, seedCustomFromPreset,
} from '../../src/theme'

afterEach(() => vi.unstubAllGlobals())

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

describe('customToVars', () => {
  it('maps all six tokens onto CSS vars', () => {
    const { vars } = customToVars({
      bg: '#101020', panel: '#181828', panel2: '#202038',
      line: '#303048', fg: '#eeeeff', muted: '#9090a0',
    })
    expect(vars['--color-bg']).toBe('#101020')
    expect(vars['--color-panel']).toBe('#181828')
    expect(vars['--color-panel2']).toBe('#202038')
    expect(vars['--color-line']).toBe('#303048')
    expect(vars['--color-fg']).toBe('#eeeeff')
    expect(vars['--color-muted']).toBe('#9090a0')
  })

  it('falls back per-var to the dark preset for missing or invalid values', () => {
    const { vars } = customToVars({ bg: '#101020', panel: 'nope' })
    expect(vars['--color-bg']).toBe('#101020')
    expect(vars['--color-panel']).toBe(PRESETS.dark.vars['--color-panel'])
    expect(vars['--color-fg']).toBe(PRESETS.dark.vars['--color-fg'])
  })

  it('derives the color scheme from the background luminance', () => {
    expect(customToVars({ bg: '#ffffff' }).scheme).toBe('light')
    expect(customToVars({ bg: '#000000' }).scheme).toBe('dark')
    expect(customToVars(undefined).scheme).toBe('dark') // dark-preset fallback bg
  })

  it('normalizes 3-digit hex', () => {
    expect(customToVars({ bg: '#FFF' }).vars['--color-bg']).toBe('#ffffff')
  })
})

describe('seedCustomFromPreset', () => {
  it('copies the preset surface vars into token keys', () => {
    expect(seedCustomFromPreset('wine')).toEqual({
      bg: PRESETS.wine.vars['--color-bg'],
      panel: PRESETS.wine.vars['--color-panel'],
      panel2: PRESETS.wine.vars['--color-panel2'],
      line: PRESETS.wine.vars['--color-line'],
      fg: PRESETS.wine.vars['--color-fg'],
      muted: PRESETS.wine.vars['--color-muted'],
    })
  })
})

describe('load/save round-trip with custom preset', () => {
  it('persists preset custom with its colors', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveTheme({ preset: 'custom', accent: '#2f6feb', custom: { bg: '#101020' } })
    const loaded = loadTheme()
    expect(loaded.preset).toBe('custom')
    expect(loaded.custom?.bg).toBe('#101020')
    expect(loaded.accent).toBe('#2f6feb')
  })

  it('drops invalid custom hexes on load', () => {
    vi.stubGlobal('localStorage', fakeStorage({
      'irisui.theme': JSON.stringify({
        preset: 'custom', accent: '#2f6feb',
        custom: { bg: '#101020', panel: 'garbage', fg: 42 },
      }),
    }))
    const loaded = loadTheme()
    expect(loaded.custom).toEqual({ bg: '#101020' })
  })

  it('falls back to the default preset when custom is selected but has no valid colors', () => {
    vi.stubGlobal('localStorage', fakeStorage({
      'irisui.theme': JSON.stringify({ preset: 'custom', accent: '#2f6feb', custom: { bg: 'nope' } }),
    }))
    expect(loadTheme().preset).toBe(DEFAULT_THEME.preset)
  })

  it('still loads plain presets unchanged', () => {
    vi.stubGlobal('localStorage', fakeStorage({
      'irisui.theme': JSON.stringify({ preset: 'wine', accent: '#b8404d' }),
    }))
    expect(loadTheme()).toEqual({ preset: 'wine', accent: '#b8404d', custom: undefined })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/theme-custom.test.ts`
Expected: FAIL — `customToVars`/`seedCustomFromPreset` not exported; `preset: 'custom'` rejected by `loadTheme`.

- [ ] **Step 3: Implement in `src/theme.ts`**

a. Change the preset type (line 8) and settings interface:

```ts
export type ThemePreset = 'light' | 'dark' | 'wine' | 'custom'

export interface CustomThemeVars {
  bg: string
  panel: string
  panel2: string
  line: string
  fg: string
  muted: string
}

export interface ThemeSettings {
  preset: ThemePreset
  accent: string
  /** User-picked surface colors; present once the custom theme has been edited. */
  custom?: Partial<CustomThemeVars>
}
```

Note: `PRESETS` keeps its three concrete entries — change its type to
`Record<Exclude<ThemePreset, 'custom'>, { label: string; scheme: 'light' | 'dark'; vars: Vars }>`.

b. Add after the `ACCENTS` array:

```ts
const CUSTOM_TOKEN_MAP = [
  ['bg', '--color-bg'],
  ['panel', '--color-panel'],
  ['panel2', '--color-panel2'],
  ['line', '--color-line'],
  ['fg', '--color-fg'],
  ['muted', '--color-muted'],
] as const

/** Editor rows for Settings → Appearance. */
export const CUSTOM_TOKEN_LABELS: { key: keyof CustomThemeVars; label: string }[] = [
  { key: 'bg', label: 'Background' },
  { key: 'panel', label: 'Panel' },
  { key: 'panel2', label: 'Elevated panel' },
  { key: 'line', label: 'Border' },
  { key: 'fg', label: 'Text' },
  { key: 'muted', label: 'Muted text' },
]

/**
 * Resolve user-picked tokens to CSS vars. Missing/invalid entries fall back
 * per-var to the dark preset, and the color scheme follows the background's
 * luminance so form controls / scrollbars match automatically.
 */
export function customToVars(
  custom: Partial<CustomThemeVars> | undefined,
): { vars: Vars; scheme: 'light' | 'dark' } {
  const fallback = PRESETS.dark.vars
  const vars: Vars = {}
  for (const [key, cssVar] of CUSTOM_TOKEN_MAP) {
    const value = custom?.[key]
    vars[cssVar] = value && isValidHex(value) ? normalizeHex(value) : fallback[cssVar]
  }
  return { vars, scheme: luminance(vars['--color-bg']) > 0.5 ? 'light' : 'dark' }
}

/** Copy a preset's surface colors into editable custom tokens. */
export function seedCustomFromPreset(preset: Exclude<ThemePreset, 'custom'>): CustomThemeVars {
  const vars = PRESETS[preset].vars
  return {
    bg: vars['--color-bg'],
    panel: vars['--color-panel'],
    panel2: vars['--color-panel2'],
    line: vars['--color-line'],
    fg: vars['--color-fg'],
    muted: vars['--color-muted'],
  }
}
```

c. In `applyTheme`, replace the preset-resolution block (the `const preset = PRESETS[...]` line and the `for` loop that writes vars, plus the final `colorScheme` line):

```ts
  const resolved =
    theme.preset === 'custom'
      ? customToVars(theme.custom)
      : (() => {
          const p = PRESETS[theme.preset as Exclude<ThemePreset, 'custom'>] ?? PRESETS.light
          return { vars: p.vars, scheme: p.scheme }
        })()
  for (const [key, value] of Object.entries(resolved.vars)) {
    root.style.setProperty(key, value)
  }
```

and at the end of the function:

```ts
  root.style.colorScheme = resolved.scheme
```

d. Replace `loadTheme` with:

```ts
function sanitizeCustom(raw: unknown): Partial<CustomThemeVars> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const out: Partial<CustomThemeVars> = {}
  for (const { key } of CUSTOM_TOKEN_LABELS) {
    const v = r[key]
    if (typeof v === 'string' && isValidHex(v)) out[key] = normalizeHex(v)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function loadTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_THEME
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>
    const custom = sanitizeCustom(parsed.custom)
    const preset: ThemePreset =
      parsed.preset === 'custom'
        ? custom
          ? 'custom'
          : DEFAULT_THEME.preset
        : parsed.preset && parsed.preset in PRESETS
          ? parsed.preset
          : DEFAULT_THEME.preset
    const accent =
      parsed.accent && isValidHex(parsed.accent) ? normalizeHex(parsed.accent) : DEFAULT_THEME.accent
    return { preset, accent, custom }
  } catch {
    return DEFAULT_THEME
  }
}
```

(`saveTheme` is unchanged — `JSON.stringify` already includes `custom` when present.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/theme-custom.test.ts`
Expected: PASS. Also `npm run build` — SettingsAppearance still compiles because `PRESETS` keys are iterated with `Object.keys(PRESETS) as ThemePreset[]`; if tsc flags that cast (keys are now `Exclude<ThemePreset,'custom'>`), change that line in `SettingsAppearance.tsx` to `(Object.keys(PRESETS) as Exclude<ThemePreset, 'custom'>[])` — the full rework of that file lands in Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/theme.ts src/components/SettingsAppearance.tsx tests/lib/theme-custom.test.ts
git commit -m "feat(theme): custom preset with per-token resolution and luminance-derived scheme"
```

---

### Task 8: Custom theme editor UI (`useTheme` + `SettingsAppearance` + App wiring)

**Files:**
- Modify: `src/hooks/useTheme.ts`
- Modify: `src/components/SettingsAppearance.tsx`
- Modify: `src/App.tsx`, `src/components/SettingsModal.tsx` (prop plumbing)

**Interfaces:**
- Consumes: `CustomThemeVars`, `CUSTOM_TOKEN_LABELS`, `customToVars`, `seedCustomFromPreset` (Task 7).
- Produces: `useTheme()` additionally returns `setCustomVar(key: keyof CustomThemeVars, hex: string)` and `seedCustomFrom(preset: Exclude<ThemePreset, 'custom'>)`; `SettingsAppearance` gains props `onSetCustomVar` and `onSeedCustomFrom` (same signatures).

- [ ] **Step 1: Extend `useTheme`**

Replace `src/hooks/useTheme.ts` content with:

```ts
import { useCallback, useEffect, useState } from 'react'
import type { CustomThemeVars, ThemePreset, ThemeSettings } from '../theme'
import { DEFAULT_THEME, applyTheme, loadTheme, saveTheme, seedCustomFromPreset } from '../theme'

/** Holds the current theme, applies it to <html> on change, and persists it. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeSettings>(() => loadTheme())

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  // Selecting Custom for the first time seeds the editor from the preset the
  // user is looking at, so they tweak from something coherent.
  const setPreset = useCallback(
    (preset: ThemePreset) =>
      setTheme((t) =>
        preset === 'custom'
          ? {
              ...t,
              preset,
              custom: t.custom ?? seedCustomFromPreset(t.preset === 'custom' ? 'dark' : t.preset),
            }
          : { ...t, preset },
      ),
    [],
  )
  const setAccent = useCallback((accent: string) => setTheme((t) => ({ ...t, accent })), [])
  const setCustomVar = useCallback(
    (key: keyof CustomThemeVars, hex: string) =>
      setTheme((t) => ({
        ...t,
        preset: 'custom',
        custom: {
          ...(t.custom ?? seedCustomFromPreset(t.preset === 'custom' ? 'dark' : t.preset)),
          [key]: hex,
        },
      })),
    [],
  )
  const seedCustomFrom = useCallback(
    (preset: Exclude<ThemePreset, 'custom'>) =>
      setTheme((t) => ({ ...t, preset: 'custom', custom: seedCustomFromPreset(preset) })),
    [],
  )
  // Reset returns to the default preset but keeps the saved custom colors, so
  // re-selecting Custom restores the user's palette.
  const reset = useCallback(() => setTheme((t) => ({ ...DEFAULT_THEME, custom: t.custom })), [])

  return { theme, setPreset, setAccent, setCustomVar, seedCustomFrom, reset }
}
```

- [ ] **Step 2: Rework `SettingsAppearance`**

Replace `src/components/SettingsAppearance.tsx` content with:

```tsx
import { useState } from 'react'
import { Check, RotateCcw, SwatchBook } from 'lucide-react'
import type { CustomThemeVars, ThemePreset, ThemeSettings } from '../theme'
import { ACCENTS, CUSTOM_TOKEN_LABELS, PRESETS, customToVars, isValidHex } from '../theme'

type ConcretePreset = Exclude<ThemePreset, 'custom'>

function TokenRow({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  // Draft state lets the user type through invalid intermediate hex values;
  // only valid input is committed (same philosophy as the accent picker).
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (v: string) => {
    if (isValidHex(v)) {
      onChange(v.startsWith('#') ? v : `#${v}`)
      setDraft(null)
    } else {
      setDraft(v)
    }
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-fg">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => commit(e.target.value)}
          aria-label={`${label} color`}
          className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5"
        />
        <input
          type="text"
          value={draft ?? value}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setDraft(null)}
          spellCheck={false}
          aria-label={`${label} hex value`}
          className="w-24 rounded-lg border border-line bg-panel2 px-2 py-1 font-mono text-xs text-fg outline-none focus:border-iris"
        />
      </span>
    </div>
  )
}

export function SettingsAppearance({
  theme,
  onSelectPreset,
  onSelectAccent,
  onSetCustomVar,
  onSeedCustomFrom,
  onReset,
}: {
  theme: ThemeSettings
  onSelectPreset: (preset: ThemePreset) => void
  onSelectAccent: (hex: string) => void
  onSetCustomVar: (key: keyof CustomThemeVars, hex: string) => void
  onSeedCustomFrom: (preset: ConcretePreset) => void
  onReset: () => void
}) {
  // Resolved custom vars power both the Custom card's preview swatch and the
  // editor's current values (per-var dark fallback applies until edited).
  const resolvedCustom = customToVars(
    theme.custom ??
      (theme.preset !== 'custom'
        ? {
            bg: PRESETS[theme.preset].vars['--color-bg'],
            panel2: PRESETS[theme.preset].vars['--color-panel2'],
          }
        : undefined),
  ).vars
  const customActive = theme.preset === 'custom'

  const tokenValue = (key: keyof CustomThemeVars): string => {
    const cssVar = {
      bg: '--color-bg', panel: '--color-panel', panel2: '--color-panel2',
      line: '--color-line', fg: '--color-fg', muted: '--color-muted',
    }[key]
    return resolvedCustom[cssVar]
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Theme</h3>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PRESETS) as ConcretePreset[]).map((key) => {
            const preset = PRESETS[key]
            const active = theme.preset === key
            return (
              <button
                key={key}
                onClick={() => onSelectPreset(key)}
                className={
                  'flex flex-col gap-2 rounded-xl border p-2.5 text-left transition ' +
                  (active ? 'border-iris ring-1 ring-iris' : 'border-line hover:border-iris/50')
                }
              >
                <div className="flex h-10 overflow-hidden rounded-lg border border-line">
                  <span className="w-1/2" style={{ background: preset.vars['--color-bg'] }} />
                  <span className="w-1/2" style={{ background: preset.vars['--color-panel2'] }} />
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-fg">
                  {preset.label}
                  {active && <Check className="h-3 w-3 text-iris" />}
                </span>
              </button>
            )
          })}

          <button
            onClick={() => onSelectPreset('custom')}
            className={
              'flex flex-col gap-2 rounded-xl border p-2.5 text-left transition ' +
              (customActive ? 'border-iris ring-1 ring-iris' : 'border-line hover:border-iris/50')
            }
          >
            <div className="flex h-10 overflow-hidden rounded-lg border border-line">
              <span className="w-1/2" style={{ background: resolvedCustom['--color-bg'] }} />
              <span className="w-1/2" style={{ background: resolvedCustom['--color-panel2'] }} />
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-fg">
              <SwatchBook className="h-3 w-3" />
              Custom
              {customActive && <Check className="h-3 w-3 text-iris" />}
            </span>
          </button>
        </div>
      </section>

      {customActive && (
        <section>
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
            Custom colors
          </h3>
          <div className="space-y-2.5 rounded-xl border border-line bg-panel2/40 p-3">
            {CUSTOM_TOKEN_LABELS.map(({ key, label }) => (
              <TokenRow
                key={key}
                label={label}
                value={tokenValue(key)}
                onChange={(hex) => onSetCustomVar(key, hex)}
              />
            ))}
            <div className="flex items-center gap-2 border-t border-line pt-2.5">
              <span className="text-xs text-muted">Start from:</span>
              {(Object.keys(PRESETS) as ConcretePreset[]).map((key) => (
                <button
                  key={key}
                  onClick={() => onSeedCustomFrom(key)}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-iris/40 hover:text-fg"
                >
                  {PRESETS[key].label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Accent color</h3>
        <div className="flex flex-wrap items-center gap-2.5">
          {ACCENTS.map((swatch) => {
            const active = theme.accent.toLowerCase() === swatch.value.toLowerCase()
            return (
              <button
                key={swatch.value}
                onClick={() => onSelectAccent(swatch.value)}
                title={swatch.name}
                aria-label={swatch.name}
                className="flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-110"
                style={{
                  backgroundColor: swatch.value,
                  boxShadow: active
                    ? '0 0 0 2px var(--color-panel), 0 0 0 4px ' + swatch.value
                    : undefined,
                }}
              >
                {active && <Check className="h-4 w-4 text-white" />}
              </button>
            )
          })}

          <label className="flex h-8 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-xs text-muted transition hover:border-iris/50 hover:text-fg">
            Custom
            <input
              type="color"
              value={isValidHex(theme.accent) ? theme.accent : '#c96442'}
              onChange={(e) => onSelectAccent(e.target.value)}
              className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
              aria-label="Custom accent color"
            />
          </label>
        </div>
      </section>

      <button
        onClick={onReset}
        className="flex items-center gap-1.5 text-xs text-muted transition hover:text-fg"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset to default
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Plumb the new props**

In `src/App.tsx`, destructure the new callbacks:

```ts
const { theme, setPreset, setAccent, setCustomVar, seedCustomFrom, reset } = useTheme()
```

and pass them to the modal:

```tsx
<SettingsModal
  ...
  onSetCustomVar={setCustomVar}
  onSeedCustomFrom={seedCustomFrom}
  ...
```

In `src/components/SettingsModal.tsx`, extend the props and forward them:

```ts
import type { CustomThemeVars, ThemePreset, ThemeSettings } from '../theme'
...
  onSetCustomVar: (key: keyof CustomThemeVars, hex: string) => void
  onSeedCustomFrom: (preset: Exclude<ThemePreset, 'custom'>) => void
```

(add both to the destructured params, and pass them into `<SettingsAppearance ... onSetCustomVar={onSetCustomVar} onSeedCustomFrom={onSeedCustomFrom} />`).

- [ ] **Step 4: Verify end-to-end**

Run: `npm run build` — expected: success. Then `npm run dev` and check:
1. Settings → Appearance shows a fourth "Custom" card; selecting it seeds from the active preset and opens the six-row editor.
2. Changing "Background" via the swatch recolors the whole app instantly; typing a hex (e.g. `1a0b2e`) commits once valid.
3. "Start from: Wine" repopulates all six rows with Wine's colors.
4. A very light background flips form-control rendering to light (`color-scheme`).
5. Reload — the custom theme persists. Switch to Dark, then back to Custom — the edited colors return.
6. Reset to default → Dark preset + coral accent; re-select Custom → edited colors still there.
7. The System Monitor panel follows the custom colors (it uses only tokens).

- [ ] **Step 5: Run the full test suite and commit**

Run: `npm test` — expected: PASS.

```bash
git add src/hooks/useTheme.ts src/components/SettingsAppearance.tsx src/components/SettingsModal.tsx src/App.tsx
git commit -m "feat(theme): custom color editor in Settings → Appearance"
```

---

### Task 9: Final verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Full build + tests**

```bash
npm run build && npm test
```

Expected: both green.

- [ ] **Step 2: Manual end-to-end checklist**

With `npm run dev:ollama` running:
1. Fresh reload → monitor panel present, all cards live within ~5 s.
2. `curl -s http://localhost:5173/api/system` twice within 1 s → identical bodies (cache), and `nvidia-smi` is not spammed (check with a third rapid curl).
3. Send a long chat prompt → during generation GPU % rises in the sparkline; after completion tokens/sec updates and the VRAM "Model fit" line matches `ollama ps` output in a terminal.
4. Switch the browser tab away for 30 s, return → panel resumes updating (visibility pause works, no error accumulation in the console).
5. Kill Ollama → Ollama card `Offline`; restart → back to `Running vX.Y.Z` without reloading the page.
6. Rename/mask `nvidia-smi` is impractical on this machine — instead verify the null-GPU path by temporarily returning `null` from `queryGpu()` in the plugin, restarting dev, and confirming the Model-memory hero + hidden GPU cards; revert the edit.
7. Create a custom theme (e.g. deep navy like the reference mockup) → monitor panel, sidebar, chat, and settings all recolor consistently; no unreadable text.
8. `npm run preview` after `npm run build` → `/api/system` still served (preview middleware).

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/system-monitor-and-custom-themes
```

Then open a PR to `main` titled `feat: system monitor panel + custom themes`.
