# IrisOS M0+M1 — Spikes + Tauri Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship IrisUI v2.0 — today's app, feature-identical, as a Tauri desktop binary — after two spike gates prove Ollama streaming and module loading work on the platform.

**Architecture:** Wrap the existing Vite/React SPA in Tauri 2. All HTTP (Ollama, Hugging Face) moves from browser `fetch` to the Tauri HTTP plugin via a small `appFetch` wrapper, which deletes the dev-proxy/prod split. No shell, no SDK, no modules — those are M2/M3 plans, written after this lands.

**Tech Stack:** Tauri 2 (Rust stable MSVC), `@tauri-apps/plugin-http`, existing Vite 7 + React 18 + Vitest 4 stack.

**Spec:** `docs/superpowers/specs/2026-07-11-irisos-shell-design.md`

## Global Constraints

- Windows 11 is the dev machine; PowerShell for native commands, but npm scripts run the same everywhere.
- Tauri **2.x** for everything (`@tauri-apps/cli@^2`, `@tauri-apps/api@^2`, `tauri-plugin-http@^2`).
- Keep files under 500 lines.
- Before every commit: `npm run build && npm test` must pass.
- Do **not** add a `Co-Authored-By` trailer to commits (project rule; ignore the Bash tool's template).
- Never commit secrets. Never commit `src-tauri/target/`.
- Tasks 2 and 3 are **gates**: on FAIL, stop and revise the plan with the user — do not push through.
- The two spike apps are throwaway: they live in the scratchpad, are never committed, and only their verdicts (recorded in the Spike Results section below) persist.

## Execution status (live)

| Task | State | Commit |
|---|---|---|
| 1. Preflight | ✅ done | `9d83167` |
| 2. Spike: Ollama streaming | ⏸ **folded into Task 6's verify** — see note below | — |
| 3. Spike: module loading | ⏸ **deferred to the M3 plan** — see note below | — |
| 4. Scaffold Tauri | ✅ files written, **compile unverified** (blocked on MSVC) | `76e1d31` |
| 5. `appFetch` | ✅ done, 3 tests | `8d6acae` |
| 6. Ollama/HF transport | ✅ done, suite green unchanged | `d58c69d` |
| 7. `/api/system` → Rust | ✅ TS done, 2 tests; **Rust compile unverified** | `c2a79b4` |
| 8. Whisper runtime smoke | ⛔ blocked — needs a running desktop build | — |
| 9. First-run migration notice | ✅ done, 3 tests | `2f33f9b` |
| 10. v2.0.0 build + DoD | ⛔ blocked — needs MSVC toolchain | — |

Suite at time of writing: **238 tests / 29 files, all passing.** `tsc --noEmit` clean.

### Deviation 1 — Spike 1 folded into Task 6 rather than run as a throwaway app

The spike's purpose was to prove `tauri-plugin-http` streams before committing to
it. But `appFetch` (`src/lib/http.ts`) is the correct abstraction *regardless* of
the answer: if plugin-http cannot stream, only `appFetch`'s internals change — it
swaps to a Rust command emitting chunks over a `tauri::ipc::Channel`, and not one
call site moves. So the gate was folded into Task 6's real-app verification
instead of paying for a separate scaffold. **The gate itself still stands and is
still unmet**: streaming must be confirmed token-by-token in the desktop build
before v2.0 ships, and it is a DoD item in Task 10.

### Deviation 2 — Spike 2 deferred to the M3 plan

Loading a module over a custom protocol with a shared React instance gates the
**IrisOS module loader (M3)**. It does not gate the Tauri migration: M1 ships one
bundled app with no modules in it. Running it here would have de-risked work that
is two plans away, at the cost of blocking work that is due now. It moves to the
M3 plan, where it remains a hard gate.

### Environment findings (2026-07-11)

- Rust was **absent**. Installed rustup → `cargo 1.97.0`.
- MSVC C++ build tools and the Windows SDK were **absent** — `cargo build` cannot
  link without them. Installing `Microsoft.VisualStudio.2022.BuildTools` with the
  VCTools workload; this is the long pole and blocks Tasks 8 and 10.
- WebView2 runtime **present** (150.0.4078.65) — ships with Windows 11.
- Ollama up, `qwen2.5:0.5b` available for the streaming check.

---

### Task 1: Preflight — Rust toolchain, commit the docs

**Files:**
- No source changes. Commits the spec + this plan.

**Branch:** `feat/tauri-migration` already exists, cut from
`feat/system-monitor-and-custom-themes` at `71d211f`. That base carries 13
unmerged system-monitor commits — a deliberate choice by the user. Two
consequences: (a) the eventual migration PR will contain them unless
system-monitor lands in `main` first; (b) porting `/api/system` off the Vite
middleware is unambiguously this branch's job — see Task 7.

**Interfaces:**
- Produces: a working `cargo` toolchain that Task 4 requires.

- [ ] **Step 1: Confirm the branch and a clean tree**

Run: `git branch --show-current && git status --porcelain`
Expected: `feat/tauri-migration`, and no output other than the untracked spec/plan docs.

- [ ] **Step 2: Verify or install the Rust toolchain**

Run: `cargo --version`
Expected: `cargo 1.x.y`

If missing, tell the user to run these themselves (installer is interactive; suggest the `!` prefix):
```powershell
winget install --id Rustlang.Rustup -e
rustup default stable-msvc
```
Rust on Windows also needs the MSVC C++ Build Tools. If `cargo build` later fails with `link.exe not found`: `winget install --id Microsoft.VisualStudio.2022.BuildTools -e` and select the "Desktop development with C++" workload.

- [ ] **Step 3: Commit the design docs**

```bash
git add docs/superpowers/specs/2026-07-11-irisos-shell-design.md docs/superpowers/plans/2026-07-11-irisos-m0-m1-tauri-migration.md
git commit -m "docs: IrisOS shell design spec and M0+M1 implementation plan"
```

---

### Task 2: Spike 1 — Ollama streaming through tauri-plugin-http (GATE)

**Files:**
- Create (throwaway, NOT committed): `<scratchpad>/iris-spike/` — a minimal Tauri app.
- Modify: the Spike Results table in this plan (committed).

**Interfaces:**
- Produces: GO/NO-GO verdict that gates Tasks 5–6. GO means: `fetch` from `@tauri-apps/plugin-http` delivers a `Response` whose `body` is a `ReadableStream` yielding chunks progressively (not buffered until completion), and `AbortSignal` cancels mid-stream. Chat streaming and the stop button depend on exactly these two behaviors.

- [ ] **Step 1: Confirm Ollama is running and pick a model**

Run: `ollama list`
Expected: at least one model listed. Use the first model name in the steps below (referred to as `MODEL`). If Ollama isn't running: `ollama serve` in a background terminal.

- [ ] **Step 2: Scaffold the throwaway app (vanilla template — no bundler, so import maps work natively for Spike 2)**

```bash
cd <scratchpad>
npm create tauri-app@latest iris-spike -- --template vanilla --manager npm --yes
cd iris-spike
npm install
npm run tauri add http
```

`tauri add http` installs the npm package + Rust crate, registers the plugin in `lib.rs`, and adds `http:default` to capabilities.

- [ ] **Step 3: Grant the HTTP scope**

Edit `src-tauri/capabilities/default.json` so the permissions array contains:

```json
"permissions": [
  "core:default",
  {
    "identifier": "http:default",
    "allow": [{ "url": "http://localhost:11434/**" }]
  }
]
```

- [ ] **Step 4: Write the streaming test page**

Replace the spike's `src/index.html` body content with:

```html
<button id="stream">Stream test</button>
<button id="abort-test">Abort test</button>
<pre id="log" style="max-height:70vh;overflow:auto"></pre>
<script type="module" src="/stream-test.js"></script>
```

Create `src/stream-test.js`:

```js
import { fetch } from '@tauri-apps/plugin-http'

const MODEL = 'REPLACE_WITH_ollama_list_MODEL'
const logEl = document.querySelector('#log')
const log = (s) => { logEl.textContent += s + '\n' }

async function stream(signal, onChunk) {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [{ role: 'user', content: 'Count from 1 to 40, one number per line, no other text.' }],
    }),
  })
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onChunk(value)
  }
}

document.querySelector('#stream').addEventListener('click', async () => {
  const t0 = performance.now()
  const arrivals = []
  await stream(undefined, () => {
    arrivals.push(Math.round(performance.now() - t0))
    log(`chunk ${arrivals.length} @ ${arrivals.at(-1)}ms`)
  })
  const spread = arrivals.at(-1) - arrivals[0]
  log(`chunks=${arrivals.length} spread=${spread}ms`)
  log(arrivals.length >= 5 && spread >= 1000 ? 'STREAMING: PASS' : 'STREAMING: FAIL (buffered?)')
})

document.querySelector('#abort-test').addEventListener('click', async () => {
  const ac = new AbortController()
  let last = performance.now()
  setTimeout(() => { ac.abort(); last = performance.now() }, 1500)
  try {
    await stream(ac.signal, () => {})
    log('ABORT: FAIL (stream ran to completion)')
  } catch {
    const latency = Math.round(performance.now() - last)
    log(`ABORT: ${latency < 500 ? 'PASS' : 'FAIL'} (stopped ${latency}ms after abort)`)
  }
})
```

- [ ] **Step 5: Run it and judge**

Run: `npm run tauri dev` (first Rust compile takes several minutes)
In the window: click **Stream test**, then **Abort test**.

PASS requires all of:
- ≥ 5 chunks, arriving progressively (spread ≥ 1000 ms — not one burst at the end)
- abort stops the stream within 500 ms

- [ ] **Step 6: Record the verdict**

Fill in row 1 of the Spike Results table in this plan with the numbers.

**On NO-GO:** stop. The fallback is a Rust command streaming via `reqwest` + `tauri::ipc::Channel` (Rust reads the response stream and emits each chunk to JS through a channel) — this always works but changes Task 5/6's design. Revise the plan with the user before proceeding.

```bash
git add docs/superpowers/plans/2026-07-11-irisos-m0-m1-tauri-migration.md
git commit -m "docs: record spike 1 verdict (ollama streaming via plugin-http)"
```

---

### Task 3: Spike 2 — dynamic import over a custom protocol with shared React (GATE)

**Files:**
- Modify (throwaway): the same `<scratchpad>/iris-spike/` app.
- Modify: the Spike Results table in this plan (committed).

**Interfaces:**
- Produces: GO/NO-GO verdict for the whole IrisOS-on-Tauri premise (gates the M3 loader design). GO means: a `.mjs` file on disk, served by a Rust `register_uri_scheme_protocol` handler, can be `import()`ed by the webview, renders with the **host's** React (hooks work — two React copies throw "Invalid hook call"), and reads the host's CSS theme variables.

- [ ] **Step 1: Add the protocol handler to the spike's `src-tauri/src/lib.rs`**

Full file:

```rust
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .register_uri_scheme_protocol("iris-module", |ctx, request| {
            let path = request.uri().path().trim_start_matches('/');
            let file = ctx
                .app_handle()
                .path()
                .app_data_dir()
                .expect("no app data dir")
                .join("modules")
                .join(path);
            let (status, mime, body) = match std::fs::read(&file) {
                Ok(bytes) => (200, "text/javascript", bytes),
                Err(_) => (404, "text/plain", b"not found".to_vec()),
            };
            tauri::http::Response::builder()
                .status(status)
                .header("Content-Type", mime)
                // import() of a cross-origin ES module is a CORS request;
                // without this header the import fails.
                .header("Access-Control-Allow-Origin", "*")
                .body(body)
                .unwrap()
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Put a module on disk**

Find the spike's identifier: `grep '"identifier"' src-tauri/tauri.conf.json` — call it `IDENT`. Then:

```powershell
New-Item -ItemType Directory -Force "$env:APPDATA\IDENT\modules"
```

Create `$env:APPDATA\IDENT\modules\hello.mjs` (Write tool):

```js
import React from 'react'

export default function Hello() {
  const [n, setN] = React.useState(0)
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return React.createElement(
    'button',
    { onClick: () => setN(n + 1) },
    `clicks: ${n} | host accent: ${accent || 'NOT FOUND'}`,
  )
}
```

- [ ] **Step 3: Give the host an import map, a theme variable, and a loader button**

In the spike's `src/index.html`, add inside `<head>` (the import map MUST come before any module script):

```html
<script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.3.1",
      "react-dom/client": "https://esm.sh/react-dom@18.3.1/client"
    }
  }
</script>
<style>:root { --accent: #e0656f; }</style>
```

Add to the body:

```html
<button id="load">Load module</button>
<div id="slot"></div>
<script type="module" src="/module-test.js"></script>
```

Create `src/module-test.js`:

```js
import React from 'react'
import { createRoot } from 'react-dom/client'

// Tauri custom protocols surface as http://<scheme>.localhost/ on Windows,
// and <scheme>://localhost/ on macOS/Linux.
const moduleUrl = navigator.userAgent.includes('Windows')
  ? 'http://iris-module.localhost/hello.mjs'
  : 'iris-module://localhost/hello.mjs'

document.querySelector('#load').addEventListener('click', async () => {
  const mod = await import(moduleUrl)
  createRoot(document.querySelector('#slot')).render(React.createElement(mod.default))
})
```

- [ ] **Step 4: Run and judge**

Run: `npm run tauri dev`
Click **Load module**, then click the rendered button three times.

PASS requires all of:
- the module renders (no import/CORS error in the devtools console)
- clicking increments the counter (hooks work → exactly one React instance; two copies would throw "Invalid hook call")
- the button shows `host accent: #e0656f` (module reads host CSS vars)

- [ ] **Step 5: Record the verdict and clean up**

Fill in row 2 of the Spike Results table. Delete `<scratchpad>/iris-spike/` — it has served its purpose.

**On NO-GO:** stop and revise with the user. Likely failure points and their meaning: CORS error → protocol handler headers; "Invalid hook call" → import-map/vite interaction needs a different vendoring strategy in M3.

```bash
git add docs/superpowers/plans/2026-07-11-irisos-m0-m1-tauri-migration.md
git commit -m "docs: record spike 2 verdict (module import over custom protocol)"
```

---

### Task 4: Scaffold Tauri into the repo

**Files:**
- Create: `src-tauri/` (config, Rust crate, capabilities, icons)
- Modify: `package.json` (deps + `tauri` script), `vite.config.ts:21-35` (add strictPort; proxies stay for now), `.gitignore`

**Interfaces:**
- Consumes: nothing from earlier tasks (spikes were throwaway).
- Produces: `npm run tauri dev` opens the full IrisUI app in a desktop window. Task 5 relies on `@tauri-apps/plugin-http` being installed and registered; Task 9 relies on `npm run tauri build` working.

- [ ] **Step 1: Install dependencies and scaffold**

```bash
npm install -D @tauri-apps/cli@^2
npm install @tauri-apps/api@^2 @tauri-apps/plugin-http@^2
npx tauri init --app-name IrisUI --window-title IrisUI --frontend-dist ../dist --dev-url http://localhost:5173 --before-dev-command "npm run dev" --before-build-command "npm run build" --ci
```

Add to `package.json` scripts: `"tauri": "tauri"`.

- [ ] **Step 2: Write the final `src-tauri/tauri.conf.json`**

Replace the generated file with:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "IrisUI",
  "version": "../package.json",
  "identifier": "com.iris.irisui",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "IrisUI",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

`"csp": null` is deliberate for M1: `@huggingface/transformers` downloads Whisper weights from HF CDN hosts that change names; a strict CSP lands with the M3 module loader where it pays for itself. `"version": "../package.json"` reads the version field so there is one source of truth.

- [ ] **Step 3: Register the HTTP plugin in Rust**

`src-tauri/src/lib.rs` (full file):

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

In `src-tauri/Cargo.toml`, under `[dependencies]`, add:

```toml
tauri-plugin-http = "2"
```

- [ ] **Step 4: Grant the HTTP scope**

`src-tauri/capabilities/default.json` (full file):

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    {
      "identifier": "http:default",
      "allow": [{ "url": "http://**" }, { "url": "https://**" }]
    }
  ]
}
```

The broad scope is deliberate: Settings lets users point at any remote/LAN Ollama host (`appSettings.ollamaUrl`), so the allowlist cannot be static. All modules are first-party (spec: trust model), so this is honest rather than lax.

- [ ] **Step 5: Generate icons from the existing brand mark**

Run: `npm run tauri icon public/iris.svg`
Expected: PNG/ICO/ICNS files written to `src-tauri/icons/`.
If the CLI rejects SVG input, rasterize `public/iris.svg` to a 1024×1024 PNG first (any tool) and rerun with that path.

- [ ] **Step 6: Pin the dev port**

In `vite.config.ts`, change the `server` block (keep the proxies — they're removed in Task 6):

```ts
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
```

`tauri.conf.json` hardcodes `devUrl: http://localhost:5173`; without `strictPort`, Vite silently picks 5174 when 5173 is busy and the desktop window loads nothing.

- [ ] **Step 7: Verify gitignore**

Confirm `src-tauri/.gitignore` exists and contains `target` (tauri init creates it). If not, add `src-tauri/target/` to the root `.gitignore`.

- [ ] **Step 8: Smoke-test the window**

Run: `npm run tauri dev`
Expected: a desktop window opens showing IrisUI. Chat still works — at this stage requests go browser-fetch → Vite dev proxy, same as before. Close the window.

- [ ] **Step 9: Verify web build still passes, then commit**

Run: `npm run build && npm test`
Expected: both pass, no changes to their behavior.

```bash
git add package.json package-lock.json vite.config.ts src-tauri .gitignore
git commit -m "feat: scaffold Tauri 2 desktop shell around the existing app"
```

---

### Task 5: `appFetch` — one fetch for desktop and tests

**Files:**
- Create: `src/lib/http.ts`
- Test: `tests/lib/http.test.ts`

**Interfaces:**
- Consumes: `@tauri-apps/plugin-http` (installed in Task 4).
- Produces: `appFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>` and `isTauri(): boolean`. Task 6 replaces every `fetch(` call site with `appFetch(`; Task 8 uses `isTauri()` for the first-run notice.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/http.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appFetch, isTauri } from '../../src/lib/http'

const pluginFetch = vi.fn().mockResolvedValue(new Response('tauri'))
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: pluginFetch }))

afterEach(() => {
  vi.unstubAllGlobals()
  pluginFetch.mockClear()
})

describe('appFetch', () => {
  it('falls back to global fetch outside Tauri', async () => {
    const globalFetch = vi.fn().mockResolvedValue(new Response('web'))
    vi.stubGlobal('fetch', globalFetch)
    expect(isTauri()).toBe(false)
    await appFetch('http://localhost:11434/api/tags')
    expect(globalFetch).toHaveBeenCalledOnce()
    expect(pluginFetch).not.toHaveBeenCalled()
  })

  it('uses the Tauri HTTP plugin when __TAURI_INTERNALS__ is present', async () => {
    const globalFetch = vi.fn()
    vi.stubGlobal('fetch', globalFetch)
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    expect(isTauri()).toBe(true)
    await appFetch('http://localhost:11434/api/tags', { method: 'GET' })
    expect(pluginFetch).toHaveBeenCalledOnce()
    expect(globalFetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/http.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/http`.

- [ ] **Step 3: Implement**

Create `src/lib/http.ts`:

```ts
/**
 * Single fetch entry point for the app. Inside the Tauri desktop shell the
 * request is issued from the Rust side via the HTTP plugin — no browser
 * origin, so CORS never applies (Ollama needs no OLLAMA_ORIGINS config, and
 * the webview origin `http://tauri.localhost` needs no allowlisting). Outside
 * Tauri (vitest, a stray browser tab) it falls back to the platform fetch.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function appFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (isTauri()) {
    // Dynamic import so non-Tauri environments never load the plugin.
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    return tauriFetch(input, init)
  }
  return globalThis.fetch(input, init)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/http.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Full check and commit**

Run: `npm run build && npm test`
Expected: pass.

```bash
git add src/lib/http.ts tests/lib/http.test.ts
git commit -m "feat: appFetch wrapper routing HTTP through the Tauri plugin"
```

---

### Task 6: Rewire Ollama + Hugging Face transport; delete the dev proxies

**Files:**
- Modify: `src/lib/ollama.ts` (header comment, `getOllamaBase`, 7 fetch call sites at lines 24, 59, 109, 130, 148, 198, 238)
- Modify: `src/lib/huggingface.ts` (line 21 `HF_BASE`, line 56 fetch)
- Modify: `vite.config.ts` (remove both proxies + stale comment)
- Test: existing `tests/lib/ctx-ollama.test.ts` must keep passing **unchanged** (it stubs global fetch; in vitest's node env `appFetch` falls through to exactly that).

**Interfaces:**
- Consumes: `appFetch` from `src/lib/http.ts` (Task 5 signature).
- Produces: all app HTTP flows through `appFetch`; `getOllamaBase()` returns the custom host or `http://localhost:11434` with no DEV branch. Task 9's DoD streams chat through this path.

- [ ] **Step 1: Rewrite `getOllamaBase` and its comment in `src/lib/ollama.ts`**

Replace lines 5–19 with:

```ts
/**
 * Base URL for every Ollama request. A custom host configured in Settings
 * always wins — pointing at a remote/LAN Ollama instance is supported.
 * Requests are issued via appFetch: inside the desktop shell they go out
 * from the Rust side (no CORS), so no dev proxy or OLLAMA_ORIGINS config is
 * needed. Read fresh on every call (not cached at import time) so a Settings
 * change takes effect immediately.
 */
export function getOllamaBase(): string {
  const custom = loadAppSettings().ollamaUrl.trim()
  if (custom) return custom.replace(/\/+$/, '')
  return 'http://localhost:11434'
}
```

- [ ] **Step 2: Swap the call sites**

In `src/lib/ollama.ts`: add `import { appFetch } from './http'` and replace all 7 `await fetch(` occurrences with `await appFetch(`.

In `src/lib/huggingface.ts`: add the same import, change line 21 to `const HF_BASE = 'https://huggingface.co'`, and change line 56's `fetch(` to `appFetch(`.

Then run: `grep -rn "import.meta.env.DEV" src/` — expected: no hits in `ollama.ts` or `huggingface.ts` (other files, if any, are out of scope — leave them).

- [ ] **Step 3: Delete the proxies — full new `vite.config.ts`**

`systemStatsPlugin()` stays for now — it still serves `/api/system` to the
System Monitor. Task 7 ports that to Rust and removes it. Dropping it here
would kill the monitor with no replacement.

```ts
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { systemStatsPlugin } from './scripts/systemStatsPlugin'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

// IrisUI runs inside a Tauri webview. All HTTP to Ollama / Hugging Face goes
// through the Tauri HTTP plugin (src/lib/http.ts), so the old dev proxies are
// gone. strictPort keeps the dev server on the port tauri.conf.json expects.
export default defineConfig({
  plugins: [react(), tailwindcss(), systemStatsPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
```

- [ ] **Step 4: Verify the suite passes unchanged**

Run: `npm run build && npm test`
Expected: all tests pass, including `ctx-ollama.test.ts` with zero edits — its `vi.stubGlobal('fetch', …)` is exactly the fallback path `appFetch` takes outside Tauri.

- [ ] **Step 5: Manual verify in the desktop window**

Run: `npm run tauri dev`
- Send a chat message: tokens must stream in progressively (this now exercises plugin-http end to end, the Spike 1 path, in the real app).
- Click stop mid-generation: the stream must halt (AbortSignal through the plugin).
- Open the Models page: installed models list loads; the Hugging Face browser loads and paginates.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ollama.ts src/lib/huggingface.ts vite.config.ts
git commit -m "feat: route Ollama and HF through the Tauri HTTP plugin; drop dev proxies"
```

---

### Task 7: Port `/api/system` from Vite middleware to a Rust command

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `sysinfo`), `src-tauri/src/lib.rs` (add the command)
- Modify: `src/lib/system.ts:1-29` (header comment + `fetchSystemStats`)
- Modify: `vite.config.ts` (drop `systemStatsPlugin`)
- Delete: `scripts/systemStatsPlugin.ts`, `tests/scripts/systemStatsPlugin.test.ts`
- Test: `tests/lib/system-invoke.test.ts`

**Why:** `src/lib/system.ts:26` fetches `/api/system` as a **same-origin relative URL**, served by a Vite middleware (`scripts/systemStatsPlugin.ts`) whose collectors are Node-only — `os.cpus()`, `execFile('nvidia-smi')`, `statfs`. A Tauri release build serves `dist/` as static files: no Vite, no middleware, `fetch('/api/system')` 404s and the System Monitor silently dies. It would still *work* under `npm run tauri dev` (which points at the Vite server), so this breaks only in the shipped binary — exactly the failure the migration must catch.

**Interfaces:**
- Consumes: `isTauri()` from `src/lib/http.ts` (Task 5).
- Produces: Tauri command `system_stats` returning JSON matching the **existing, unchanged** `SystemSnapshot` interface (`src/lib/system.ts:16-21`): `{ gpu: GpuStats | null, cpu: { utilPct, cores }, ram: { usedBytes, totalBytes }, disk: { freeBytes, totalBytes } | null }`. `fetchSystemStats(signal?)` keeps its signature, so `src/hooks/useSystemMonitor.ts` and `SystemMonitor.tsx` need **no changes**. All other exports of `system.ts` (`vramFit`, `formatTimeLeft`, `pushSample`, `loadMonitorOpen`, `saveMonitorOpen`, `GIB`) are pure and untouched.

- [ ] **Step 1: Add the sysinfo crate**

In `src-tauri/Cargo.toml` under `[dependencies]`:

```toml
sysinfo = "0.32"
```

- [ ] **Step 2: Write the Rust command**

Full `src-tauri/src/lib.rs`:

```rust
use std::process::Command;
use sysinfo::{Disks, System};

#[derive(serde::Serialize)]
struct GpuStats {
    name: String,
    #[serde(rename = "utilPct")]
    util_pct: u32,
    #[serde(rename = "vramUsedMb")]
    vram_used_mb: u64,
    #[serde(rename = "vramTotalMb")]
    vram_total_mb: u64,
    #[serde(rename = "tempC")]
    temp_c: u32,
}

#[derive(serde::Serialize)]
struct Cpu {
    #[serde(rename = "utilPct")]
    util_pct: u32,
    cores: usize,
}

#[derive(serde::Serialize)]
struct Ram {
    #[serde(rename = "usedBytes")]
    used_bytes: u64,
    #[serde(rename = "totalBytes")]
    total_bytes: u64,
}

#[derive(serde::Serialize)]
struct Disk {
    #[serde(rename = "freeBytes")]
    free_bytes: u64,
    #[serde(rename = "totalBytes")]
    total_bytes: u64,
}

#[derive(serde::Serialize)]
struct SystemSnapshot {
    gpu: Option<GpuStats>,
    cpu: Cpu,
    ram: Ram,
    disk: Option<Disk>,
}

/// Mirrors parseNvidiaSmi from the old Vite plugin: one CSV line,
/// `name, util, mem.used, mem.total, temp`. Any malformed field => None.
fn parse_nvidia_smi(line: &str) -> Option<GpuStats> {
    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    if parts.len() < 5 || parts[0].is_empty() {
        return None;
    }
    Some(GpuStats {
        name: parts[0].to_string(),
        util_pct: parts[1].parse().ok()?,
        vram_used_mb: parts[2].parse().ok()?,
        vram_total_mb: parts[3].parse().ok()?,
        temp_c: parts[4].parse().ok()?,
    })
}

fn query_gpu() -> Option<GpuStats> {
    let out = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    parse_nvidia_smi(stdout.lines().next()?)
}

/// Largest disk by total space — a good proxy for where Ollama keeps models,
/// without the OLLAMA_MODELS path-probing the Node version did.
fn query_disk() -> Option<Disk> {
    let disks = Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .max_by_key(|d| d.total_space())
        .map(|d| Disk {
            free_bytes: d.available_space(),
            total_bytes: d.total_space(),
        })
}

#[tauri::command]
async fn system_stats() -> SystemSnapshot {
    let mut sys = System::new();

    // CPU % needs two samples separated by at least MINIMUM_CPU_UPDATE_INTERVAL.
    sys.refresh_cpu_usage();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpus = sys.cpus();
    let util = if cpus.is_empty() {
        0.0
    } else {
        cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpus.len() as f32
    };

    SystemSnapshot {
        gpu: query_gpu(),
        cpu: Cpu {
            util_pct: util.round().clamp(0.0, 100.0) as u32,
            cores: cpus.len(),
        },
        ram: Ram {
            used_bytes: sys.used_memory(),
            total_bytes: sys.total_memory(),
        },
        disk: query_disk(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![system_stats])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Write the failing client test**

Create `tests/lib/system-invoke.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSystemStats } from '../../src/lib/system'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

const SNAPSHOT = {
  gpu: { name: 'RTX 4090', utilPct: 42, vramUsedMb: 8000, vramTotalMb: 24564, tempC: 61 },
  cpu: { utilPct: 12, cores: 16 },
  ram: { usedBytes: 17_000_000_000, totalBytes: 34_000_000_000 },
  disk: { freeBytes: 500_000_000_000, totalBytes: 2_000_000_000_000 },
}

afterEach(() => {
  vi.unstubAllGlobals()
  invoke.mockReset()
})

describe('fetchSystemStats', () => {
  it('rejects outside Tauri so the panel degrades to Ollama-derived data', async () => {
    await expect(fetchSystemStats()).rejects.toThrow(/desktop/i)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('invokes the system_stats command inside Tauri', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    invoke.mockResolvedValue(SNAPSHOT)
    await expect(fetchSystemStats()).resolves.toEqual(SNAPSHOT)
    expect(invoke).toHaveBeenCalledWith('system_stats')
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run tests/lib/system-invoke.test.ts`
Expected: FAIL — `fetchSystemStats` still calls `fetch('/api/system')`, so it does not reject with a "desktop" message and never invokes.

- [ ] **Step 5: Rewrite the client**

In `src/lib/system.ts`, replace the header comment (lines 1-6) and `fetchSystemStats` (lines 25-29):

```ts
/**
 * Client side of the System Monitor. Hardware stats come from the `system_stats`
 * Tauri command (nvidia-smi + sysinfo, in Rust) — the old /api/system Vite
 * middleware is gone, because a release build serves static files with no dev
 * server behind them. Outside the desktop shell this rejects and the panel
 * degrades to Ollama-derived data, which is the pre-existing failure path.
 */
import { isTauri } from './http'
```

```ts
export async function fetchSystemStats(_signal?: AbortSignal): Promise<SystemSnapshot> {
  if (!isTauri()) throw new Error('system stats need the desktop app')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<SystemSnapshot>('system_stats')
}
```

`_signal` is kept so `useSystemMonitor.ts` compiles unchanged; Tauri commands are not abortable, and the hook already discards late results.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/lib/system-invoke.test.ts`
Expected: 2 passed.

- [ ] **Step 7: Remove the dead Vite middleware**

Delete `scripts/systemStatsPlugin.ts` and `tests/scripts/systemStatsPlugin.test.ts`. In `vite.config.ts`, remove the `systemStatsPlugin` import (line 5) and its entry in `plugins` so it reads `plugins: [react(), tailwindcss()],`.

Its pure helpers (`parseNvidiaSmi`, `cpuUtilBetween`, `createSnapshotCache`) die with it — `parse_nvidia_smi` and sysinfo replace them in Rust, and per-second snapshot caching is unnecessary now that there is no HTTP layer fanning out concurrent callers.

Run: `grep -rn "systemStatsPlugin\|/api/system" src/ scripts/ vite.config.ts tests/`
Expected: no hits.

- [ ] **Step 8: Verify**

Run: `npm run build && npm test`
Expected: pass. Test count drops by the removed `systemStatsPlugin.test.ts` cases and gains the two above.

Run: `npm run tauri dev`
Expected: the System Monitor panel shows real GPU name/util/VRAM/temp, CPU %, RAM, and disk — now sourced from Rust. Toggle it via the TopBar gauge icon.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src/lib/system.ts vite.config.ts tests/lib/system-invoke.test.ts
git rm scripts/systemStatsPlugin.ts tests/scripts/systemStatsPlugin.test.ts
git commit -m "feat(monitor): serve system stats from a Rust command, drop the Vite middleware"
```

---

### Task 8: Runtime smoke — Whisper model download and voice loop in the webview

**Files:**
- None expected. This task exists because transformers.js fetches Whisper weights from HF CDN hosts **at runtime** — a failure here appears in no build or test (spec risk #3).

**Interfaces:**
- Consumes: the running desktop app from Task 6.
- Produces: confirmation that `csp: null` + the webview allow the on-device ASR path; a required checkbox in Task 10's DoD.

- [ ] **Step 1: Exercise the voice path in `npm run tauri dev`**

- Settings → Voice: select the on-device (Whisper) engine.
- Record a short voice note in the chat input.
- First use must download the model (watch devtools Network for huggingface.co / CDN requests) and then produce a transcript.
- Also verify TTS playback of a response if enabled.

Expected: transcript appears; no CSP or CORS errors in the console.

- [ ] **Step 2: If it fails**

Check the devtools console. A blocked-by-CSP error means `csp` is not actually null (re-check `tauri.conf.json`); a worker instantiation error means the Vite worker bundling behaves differently under `tauri dev` — capture the exact error and stop for plan revision. Do not work around it silently.

- [ ] **Step 3: Note the result**

No commit unless a fix was needed. Record pass/fail in Task 10's DoD checklist.

---

### Task 9: First-run migration notice

**Files:**
- Create: `src/lib/firstRun.ts`, `src/components/MigrationNotice.tsx`
- Modify: `src/components/SettingsModal.tsx` (add `initialTab` prop; tab state is at line 48), `src/App.tsx` (state near line 72, render near line 303)
- Test: `tests/lib/firstRun.test.ts`

**Interfaces:**
- Consumes: `isTauri()` from `src/lib/http.ts`; existing `SettingsModal` (`open`, `onClose`, tab state `useState<Tab>('appearance')`); existing Settings → Data import UI (`SettingsData` already wires `importAll`).
- Produces: `shouldShowMigrationNotice(isTauriEnv: boolean, storage: Pick<Storage, 'getItem'>): boolean` and `dismissMigrationNotice(storage: Pick<Storage, 'setItem'>): void`; `<MigrationNotice open onImport onDismiss />`; `SettingsModal` gains optional `initialTab?: Tab`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/firstRun.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dismissMigrationNotice, shouldShowMigrationNotice } from '../../src/lib/firstRun'

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

describe('shouldShowMigrationNotice', () => {
  it('shows on first desktop launch', () => {
    expect(shouldShowMigrationNotice(true, fakeStorage())).toBe(true)
  })

  it('never shows outside Tauri', () => {
    expect(shouldShowMigrationNotice(false, fakeStorage())).toBe(false)
  })

  it('stays dismissed after dismissal', () => {
    const s = fakeStorage()
    dismissMigrationNotice(s)
    expect(shouldShowMigrationNotice(true, s)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/firstRun.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/firstRun`.

- [ ] **Step 3: Implement the logic**

Create `src/lib/firstRun.ts`:

```ts
/**
 * A desktop install is a fresh browser origin, so IndexedDB starts empty and
 * web-version data doesn't follow the user. Backup import already exists
 * (Settings → Data); this just decides whether to point at it, once.
 */
const KEY = 'iris.migration-notice-dismissed'

export function shouldShowMigrationNotice(
  isTauriEnv: boolean,
  storage: Pick<Storage, 'getItem'>,
): boolean {
  return isTauriEnv && storage.getItem(KEY) === null
}

export function dismissMigrationNotice(storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(KEY, '1')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/firstRun.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Create the notice component**

Create `src/components/MigrationNotice.tsx` (styling follows `ConfirmDialog.tsx` conventions — `border-line bg-panel`, `text-fg`/`text-muted`, `btn-primary`, `m` + `SPRING`):

```tsx
import { AnimatePresence, m } from 'motion/react'
import { X } from 'lucide-react'
import { SPRING } from '../lib/motion'

export function MigrationNotice({
  open,
  onImport,
  onDismiss,
}: {
  open: boolean
  onImport: () => void
  onDismiss: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="migration-notice"
          className="fixed bottom-4 right-4 z-40 w-full max-w-sm rounded-2xl border border-line bg-panel p-4 shadow-2xl"
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={SPRING}
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">Coming from the web version?</h2>
            <button
              onClick={onDismiss}
              aria-label="Dismiss migration notice"
              className="rounded p-0.5 text-muted transition hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            Your conversations don&apos;t move over automatically. Export a backup from the
            web app (Settings → Data), then import it here.
          </p>
          <div className="mt-3 flex justify-end">
            <button
              onClick={onImport}
              className="btn-primary rounded-lg px-3.5 py-2 text-sm font-medium text-white transition active:scale-[0.97]"
            >
              Import my data
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 6: Add `initialTab` to SettingsModal**

In `src/components/SettingsModal.tsx`: add `initialTab?: Tab` to the props type, and replace the tab state at line 48:

```tsx
const [tab, setTab] = useState<Tab>(initialTab ?? 'appearance')

useEffect(() => {
  if (open) setTab(initialTab ?? 'appearance')
}, [open, initialTab])
```

(Add the `useEffect` import if the file doesn't already have it.)

- [ ] **Step 7: Wire it in App.tsx**

Add imports:

```tsx
import { MigrationNotice } from './components/MigrationNotice'
import { isTauri } from './lib/http'
import { dismissMigrationNotice, shouldShowMigrationNotice } from './lib/firstRun'
```

Near the `settingsOpen` state (line ~72):

```tsx
const [settingsTab, setSettingsTab] = useState<'data' | undefined>(undefined)
const [migrationNoticeOpen, setMigrationNoticeOpen] = useState(() =>
  shouldShowMigrationNotice(isTauri(), localStorage),
)
const closeMigrationNotice = () => {
  dismissMigrationNotice(localStorage)
  setMigrationNoticeOpen(false)
}
```

On the `<SettingsModal>` at line ~303, add the prop `initialTab={settingsTab}`, and reset it in the existing `onClose`: `setSettingsTab(undefined)`.

Next to `<SettingsModal>`, render:

```tsx
<MigrationNotice
  open={migrationNoticeOpen}
  onImport={() => {
    setSettingsTab('data')
    setSettingsOpen(true)
    closeMigrationNotice()
  }}
  onDismiss={closeMigrationNotice}
/>
```

- [ ] **Step 8: Verify**

Run: `npm run build && npm test`
Expected: pass.

Run: `npm run tauri dev`
Expected: the notice appears bottom-right on launch. "Import my data" opens Settings on the Data tab. Restart `tauri dev`: the notice must NOT reappear. (To re-test: clear the `iris.migration-notice-dismissed` localStorage key in devtools.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/firstRun.ts src/components/MigrationNotice.tsx src/components/SettingsModal.tsx src/App.tsx tests/lib/firstRun.test.ts
git commit -m "feat: first-run migration notice pointing at backup import"
```

---

### Task 10: v2.0.0 — build, Definition of Done, tag

**Files:**
- Modify: `package.json` (version `1.0.0` → `2.0.0`)

**Interfaces:**
- Consumes: everything above. `tauri.conf.json` reads its version from `package.json`, so the bump flows into the binary and installer automatically.

- [ ] **Step 1: Bump the version**

In `package.json`: `"version": "2.0.0"`.

Run: `npm run build && npm test`
Expected: pass (`__APP_VERSION__` now reports 2.0.0).

- [ ] **Step 2: Produce the release build**

Run: `npm run tauri build` (takes several minutes)
Expected: installer artifacts under `src-tauri/target/release/bundle/` (NSIS `.exe` and/or `.msi` on Windows).

- [ ] **Step 3: Definition of Done — run against the INSTALLED binary, not `tauri dev`**

Install from the bundle output, launch it, and verify each item (spec: "the app actually runs", not "cargo build succeeded"):

- [ ] App launches and renders the home screen
- [ ] A chat completion **streams** token-by-token; stop button aborts mid-stream
- [ ] A voice note records and transcribes through Whisper (model downloads on first use)
- [ ] A backup JSON exported from the web version imports via the migration notice → Settings → Data, and the conversations appear
- [ ] Models page lists installed models; HF browser paginates
- [ ] **System Monitor shows live GPU / CPU / RAM / disk** — this is the one that would have silently 404'd without Task 7, so verify it in the *installed binary*, not `tauri dev`
- [ ] Theme switching persists across an app restart

Known and accepted: the binary is unsigned — Windows SmartScreen will warn on install. Signing is deferred (spec risk #4).

- [ ] **Step 4: Commit and tag**

```bash
git add package.json package-lock.json
git commit -m "release: v2.0.0 — IrisUI as a Tauri desktop app"
git tag v2.0.0
```

Merging `feat/tauri-migration` into `main` and pushing the tag is the user's call — ask before pushing.

---

## Self-review notes

- **Spec coverage (M0+M1 scope):** both M0 spikes → Tasks 2–3 with GO/NO-GO gates; Tauri migration → Tasks 4–6; the `/api/system` → Rust port → Task 7; CSP/Whisper risk → Task 8 + the explicit `csp: null` decision; migration path → Task 9; DoD → Task 10. M2+ (SDK, chat-as-module, loader/registry) is intentionally out of scope — next plan, written against the post-M1 tree.
- **Types:** `appFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>` and `isTauri(): boolean` are used with identical signatures in Tasks 5, 6, 7, and 9. `shouldShowMigrationNotice`/`dismissMigrationNotice` signatures match between Task 9's test and implementation. Task 7's Rust `SystemSnapshot` serializes to exactly the existing TS `SystemSnapshot` interface (`src/lib/system.ts:16-21`) via `serde(rename)`, so `useSystemMonitor.ts` and `SystemMonitor.tsx` compile untouched.
- **Existing tests:** `ctx-ollama.test.ts` passes unchanged because `appFetch` falls back to the stubbed global fetch in vitest's node environment — verified by design in Task 5's first test. `tests/scripts/systemStatsPlugin.test.ts` is deleted in Task 7 along with the code it covers.
- **Branch base:** cut from `feat/system-monitor-and-custom-themes`, not `main`, so this branch carries 13 unmerged system-monitor commits. Task 7 exists *because* of that base — the System Monitor is on this branch and its Node-only backend cannot survive a static release build.
