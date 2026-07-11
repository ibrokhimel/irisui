# System Monitor Panel + Custom Themes — Design Spec

**Date:** 2026-07-11
**Status:** Approved direction (right panel · Vite-middleware stats · 7-token custom theme · all views, collapsible)

## Overview

Two features:

1. **System Monitor** — a live hardware watcher panel docked to the right edge of the app,
   matching the provided reference mockup: VRAM, GPU %, RAM, CPU %, tokens/sec, loaded
   models with unload countdowns, GPU temp, disk free, and Ollama status.
2. **Custom theme** — a new "Custom" theme preset in Settings → Appearance where the user
   picks their own color for each of the app's core color tokens.

**Hard constraints from the user:**
- Do **not** change fonts anywhere. Existing font stacks stay as-is.
- Colors may change, but only via theme tokens — the monitor panel must recolor with the
  active theme like every other surface (the mockup's navy look becomes achievable through
  a custom theme rather than hardcoded colors).

## Part 1 — System Monitor panel

### Placement & behavior

- New `SystemMonitor` component rendered in `App.tsx` as a third flex column, after
  `<main>`: `Sidebar | main | SystemMonitor`.
- Fixed width `w-80` (20 rem), full height, own vertical scroll, `border-l border-line
  bg-panel`, visible on **every view** (chat, models, knowledge, studio, arena, stats).
- **Collapsible:** a toggle button in the `TopBar` (right side, `Activity`-style lucide
  icon) shows/hides the panel; the chevron in the panel header also collapses it.
  Collapsed = panel fully hidden (main content reclaims the width).
- Collapse state persists to `localStorage` key `irisui.monitor` (`{ open: boolean }`).
- Responsive: the panel only renders at `lg:` (≥1024 px) and above. Below that it is
  unavailable in v1 (no overlay mode).
- A "Toggle system monitor" command is added to the command palette.

### Data sources

Three independent sources, each with its own failure mode. The panel degrades per-source —
one failing source never blanks the whole panel.

#### 1. `GET /api/system` — new Vite middleware (true system stats)

A small plugin module `scripts/systemStatsPlugin.mjs` registered in `vite.config.ts` via
both `configureServer` (dev) and `configurePreviewServer` (preview). It serves JSON:

```jsonc
{
  "gpu": {                    // null when nvidia-smi is unavailable (AMD/Intel/no GPU)
    "name": "NVIDIA GeForce RTX 3060",
    "utilPct": 62,
    "vramUsedMb": 8396,
    "vramTotalMb": 12288,
    "tempC": 58
  },
  "cpu": { "utilPct": 28, "cores": 16 },
  "ram": { "usedBytes": 16428372000, "totalBytes": 34359738368 },
  "disk": {                   // null when statfs fails
    "freeBytes": 152471142400,
    "totalBytes": 1000204886016
  }
}
```

Collection details:
- **GPU:** shell out to
  `nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits`.
  Any spawn error or non-zero exit → `gpu: null`. NVIDIA-only in v1 by design.
- **CPU:** sample `os.cpus()` time deltas between successive calls (module keeps the last
  sample). First call returns `utilPct: 0` and primes the sampler. No shelling out.
- **RAM:** `os.totalmem()` / `os.freemem()`.
- **Disk:** `fs.promises.statfs()` on the Ollama models dir —
  `process.env.OLLAMA_MODELS ?? join(os.homedir(), '.ollama', 'models')`, falling back to
  the home dir if that path doesn't exist.
- **Throttle:** results cached for 1 s server-side; concurrent/rapid requests reuse the
  cached snapshot, and `nvidia-smi` is never invoked more than once per second.

**Degradation:** if the endpoint 404s or network-fails (e.g. app served statically without
the plugin), the hook marks `systemAvailable: false` — the GPU/CPU/RAM/temp/disk cards are
hidden entirely and the panel shows only Ollama-derived data. No error banners, no retry
spam (poll continues at a slower 30 s cadence in case the server comes back).

#### 2. Ollama `/api/ps` + `/api/version` (loaded models, VRAM split, status)

New functions in `src/lib/ollama.ts`:
- `listRunningModels(signal?)` → `GET {base}/api/ps` → array of
  `{ name, size, size_vram, expires_at }`.
- `getOllamaVersion(signal?)` → `GET {base}/api/version` → `{ version }` (cached; refreshed
  only when status transitions offline → online).

Derived values:
- **Per-model VRAM split:** `size_vram` bytes in GPU, `size − size_vram` in system RAM.
- **"Model fit" line (VRAM hero card):** sums across loaded models —
  `Model fit: {Σ size_vram} in VRAM + {Σ (size − size_vram)} shared`. The shared part is
  omitted when zero (fully-GPU resident).
- **Unload countdown:** `expires_at − now` rendered as `11m left` / `1h 12m left`.
  `expires_at` in the far past/zero value or > 10 years out (keep_alive −1) renders as
  `pinned`. Countdown text recomputes on each poll tick, not per-second.
- **ACTIVE badge:** the model matching the chat's currently selected model
  (`chat.selectedModel`), when it appears in the loaded list.
- **Ollama status card:** green dot + `Running` + version when reachable; red dot +
  `Offline` when `/api/ps` fails. Reuses the app's existing status where possible.

#### 3. Tokens/sec (existing stats pipeline)

- The card shows `tokensPerSec` from the most recent completed generation
  (`MessageStat` — same source `App.tsx` already computes as `lastAssistantStat`).
- Sparkline = the last ≤20 completed generations' `tokensPerSec`, read from the existing
  stats store on mount and appended to in-memory as new stats arrive.
- No live mid-stream rate in v1 — the value updates when a response finishes.

### Polling model — `useSystemMonitor` hook

- `/api/system` every **2 s**; `/api/ps` every **5 s** (also refreshed immediately when a
  generation starts/finishes, so the loaded list reacts to model switches).
- Polling **pauses** when: the panel is collapsed, or `document.visibilityState` is
  `hidden`. Resumes (with an immediate fetch) on expand/visibility regain.
- Keeps rolling history buffers (last 30 samples) for GPU % and CPU % sparklines.
- All fetches go through `AbortController`; unmount/collapse aborts in-flight requests.

### Cards (top → bottom, per the mockup)

1. **VRAM hero** — `{used} / {total} GB` (large numerals), progress bar, right-aligned `%`,
   GPU name in the header, info tooltip explaining "Model fit", and the model-fit line.
   When `gpu` is null but models are loaded, this card is replaced by a **Model memory**
   card summarizing `/api/ps` footprints (so Ollama-only mode still has a hero).
2. **GPU Utilization** — big `%` + sparkline. Hidden when `gpu` null.
3. **RAM Usage** — `{used} / {total} GB`, thin bar + `%`. Hidden when system unavailable.
4. **CPU Utilization** — big `%` + sparkline. Hidden when system unavailable.
5. **Tokens / sec** — latest completed generation rate + sparkline. Always shown (shows
   `—` before the first generation).
6. **Loaded Models** — header `Loaded Models · {n} models · {total GB}`; one row per model:
   name, size, `ACTIVE` badge, clock icon + countdown. Empty state: `No models loaded`.
7. **Bottom row (3 mini-cards)** — GPU Temp (`°C`, hidden when `gpu` null), Disk Free
   (`{free} GB`, "Models Drive" caption, hidden when `disk` null), Ollama status
   (dot + Running/Offline + `v{version}`).
8. **Footer** — `Last updated: {time}` + manual refresh button (forces both polls).

GPU % / CPU % / RAM cards lay out 2-up in a grid, as in the mockup.

### Visual rules

- **Sparklines are hand-rolled SVG polylines** (~30-line `Sparkline` component). Recharts
  is NOT imported here — it stays lazy-loaded inside StatsPage only; the monitor ships in
  the main bundle and must stay light.
- All colors from theme tokens: `bg-panel` / `bg-panel2` cards, `border-line`, `text-fg` /
  `text-muted`, bars and sparklines in `--color-iris` (accent). Status dot green/red uses
  the existing emerald convention. Zero hardcoded hex values.
- Fonts: existing stack only; large numerals use `tabular-nums`.
- Number formatting reuses/extends `src/lib/format.ts` (bytes → GB one-decimal, etc.).

## Part 2 — Custom theme (Settings → Appearance)

### Model changes (`src/theme.ts`)

```ts
export type ThemePreset = 'light' | 'dark' | 'wine' | 'custom'

export interface CustomThemeVars {
  bg: string      // --color-bg
  panel: string   // --color-panel
  panel2: string  // --color-panel2
  line: string    // --color-line
  fg: string      // --color-fg
  muted: string   // --color-muted
}

export interface ThemeSettings {
  preset: ThemePreset
  accent: string            // unchanged — existing accent picker already allows any hex
  custom?: CustomThemeVars  // present once the user has ever edited the custom theme
}
```

- `applyTheme()`: when `preset === 'custom'`, write the six vars from
  `theme.custom` (invalid/missing → fall back to the dark preset's values per-var).
  `colorScheme` is derived automatically: `luminance(bg) > 0.5 ? 'light' : 'dark'` —
  no extra control for the user to manage.
- Accent handling is untouched (`--color-iris`, `--color-iris-strong`, `--color-on-accent`
  already derive from any hex).
- `loadTheme()` / `saveTheme()` extend the same `irisui.theme` localStorage JSON; loading
  validates each custom hex with `isValidHex` and drops invalid entries.

### Settings UI (`SettingsAppearance.tsx`)

- The preset grid gains a fourth card: **Custom** (swatch preview built from the saved
  custom vars, or the current preset's colors before first edit).
- Selecting Custom when no `custom` exists **seeds it from the currently active preset**,
  so the user starts from something coherent and tweaks.
- While Custom is active, a **color editor** section appears below the grid — six rows:
  Background, Panel, Elevated panel, Border, Text, Muted text. Each row: label, native
  `<input type="color">` swatch, and a hex text field (same validation pattern as the
  existing custom accent input). Every change applies **live** (the existing
  `useTheme` effect already re-applies on every state change).
- A "Start from…" row with three small buttons (Light / Dark / Wine) re-seeds all six
  values from that preset.
- Accent section is unchanged and continues to work with the custom preset.
- The existing "Reset to default" also clears the custom preset selection (back to
  `DEFAULT_THEME`), but keeps the saved `custom` colors so re-selecting Custom restores
  them.

### `useTheme` hook

Gains `setCustomVar(key, hex)` and `seedCustomFrom(preset)` callbacks; everything else
(persist + apply on change) is already generic.

## Error handling summary

| Failure | Behavior |
|---|---|
| `/api/system` missing (static hosting) | System cards hidden; slow retry (30 s); no banners |
| `nvidia-smi` absent / non-NVIDIA GPU | `gpu: null` → VRAM hero swaps to Model-memory card; GPU %/temp hidden |
| `statfs` fails | Disk card hidden |
| Ollama offline | Status card red `Offline`; loaded-models list shows empty state; other cards unaffected |
| Invalid custom hex typed | Ignored until valid (existing accent-input pattern) |
| Corrupt `irisui.theme` / `irisui.monitor` JSON | Fall back to defaults (existing pattern) |

## Testing

Vitest units (existing `tests/` conventions):
- **theme:** custom preset applies six vars; invalid hex falls back per-var; scheme derived
  from bg luminance; load/save round-trip; corrupt JSON → default.
- **ollama:** `/api/ps` parsing — VRAM split math, model-fit line (with and without shared
  portion), countdown formatting incl. `pinned` sentinel.
- **format:** byte → GB rendering used by the cards.
- **useSystemMonitor:** fake-timer tests — poll cadence, pause on collapse/hidden,
  degrade-and-slow-retry on 404, history buffer capped at 30.
- **systemStatsPlugin:** CPU delta sampler math (pure function extracted for testability);
  nvidia-smi CSV line parser.

Manual verification: run `npm run dev:ollama`, generate a response, confirm live VRAM/GPU
numbers against Task Manager / `nvidia-smi`, unplug scenarios (stop Ollama, rename
nvidia-smi) and confirm graceful degradation.

## Out of scope (v1)

- Non-NVIDIA GPU stats (AMD/Intel) — degrade to Ollama-only cards.
- Live mid-stream tokens/sec.
- Monitor panel on < 1024 px viewports (overlay mode later).
- Theme export/import/sharing.
- Tauri-native stats (the middleware's JSON shape is the contract a future Tauri command
  can implement 1:1).
