# IrisOS — Shell + Installable Modules

**Date:** 2026-07-11
**Status:** Design approved, pending implementation plan

## Summary

Convert IrisUI from a single-purpose browser chat client into **IrisOS**: a Tauri
desktop shell that provides shared services (models, storage, theme, speech,
context bus) and loads **installable modules** on demand. Today's chat UI becomes
one such module — fully uninstallable — so a user who only wants the coding
workspace never downloads it.

## Starting point

IrisUI v1.0.0 as of this writing:

- Pure Vite + React browser SPA. **No Tauri, no Electron.**
- ~9,300 lines of TypeScript across ~60 files.
- Storage is IndexedDB. Main bundle ~195 kB gzip, secondary views already
  `React.lazy`-split.
- Six views: `chat`, `models`, `knowledge`, `studio`, `arena`, `stats`.
- Ollama is reached via a Vite dev proxy (`/ollama`); production builds hit
  `http://localhost:11434` directly and depend on the user configuring
  `OLLAMA_ORIGINS`. See the comment atop `src/lib/ollama.ts`.

A key observation: **IrisUI already contains most of IrisOS.** Arena is
iris-bench. Knowledge is iris-read. Those modules are extractions, not
greenfield work.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | **Tauri desktop** | IrisCode (repo access, terminal) and IrisShell (filesystem) are impossible in a browser tab. Not "degraded" — impossible. |
| Web build | **Dropped** | Desktop-only means no capability gating, no per-module "does this need native?" branching, one code path. |
| Trust model | **First-party only** | All modules are authored by us and ship from our release channel. Modules are trusted: direct dynamic import, synchronous shell APIs, shared React. No sandbox, no permission model. |
| Repo layout | **Monorepo** | Separate repos buy nothing when there is one author and releases are lockstep; they turn every SDK change into a coordinated multi-repo PR. Modules are still *distributed* on demand. |
| Chat | **Installable module, not bundled** | The shell has no favourites. A coding-only user never downloads a message bubble. |
| RAG | **Provided by iris-read via the context bus** | Chat asks the bus for document context; if iris-read is not installed, Chat has no RAG. Makes the context bus load-bearing on day one instead of speculative. |

### Deliberately cut from the original proposal

- **Permission model.** A module loaded by dynamic import runs in the shell's JS
  realm with full access to every IndexedDB database and `fetch`, whatever its
  manifest claims. Without iframe/Worker isolation the `permissions` field is a
  comment, not a boundary. Since all modules are first-party, drop it. Accepting
  third-party modules later is a deliberate v2 project requiring real isolation.
- **Model scheduler.** Ollama already queues requests and manages GPU memory.
  We would own a request queue at most. Not v1.
- **Multi-version module API support.** Shell and modules release in lockstep;
  `minShellVersion` gates compatibility. Supporting three majors is a tax paid
  to ourselves.
- **`dependsOn` between modules.** YAGNI. Cross-module needs go through the
  context bus, which degrades gracefully when a provider is absent.

## Architecture

```
irisos/                        (monorepo)
├── packages/sdk/              @iris/sdk — the shell↔module contract
├── packages/shell/            Tauri app: core services + loader + registry
└── packages/modules/
    ├── chat/                  today's IrisUI chat
    ├── code/                  coding workspace
    ├── bench/                 extracted from Arena
    └── read/                  extracted from Knowledge
```

Each module builds to a versioned artifact (JS + manifest + assets) published to
GitHub Releases. The shell downloads them at runtime.

### The contract is an SDK, not a manifest

This is the part the original proposal omits, and it is the real design work.
A module default-exports a React component; the shell renders it inside an error
boundary and passes a context:

```ts
interface ModuleContext {
  storage: NamespacedDB    // opens iris-<id> only; a module cannot name its own DB
  models: ModelClient      // chat / generate / embed against Ollama
  context: ContextBus
  personas: PersonaService
  speech: SpeechService    // ASR + TTS
  theme: ThemeTokens
}
```

### Modules share the shell's React

**The single most likely thing to break.** If a module bundles its own React,
there are two Reacts in one page: hooks throw, context is invisible, the theme
provider does not reach the module.

Modules build with `react`, `react-dom`, and `@iris/sdk` marked `external` in
their Rollup config, resolved through an **import map the shell injects**. One
React instance, one theme context, one store.

### The loader

A **Rust custom-protocol handler** serves `iris-module://<id>/<path>` from the
app data directory, so the webview can `import()` code from disk with source maps
intact and CSP unrelaxed.

The webview cannot `import()` an arbitrary filesystem path — it lives on the
`tauri://` origin. The alternative (fetch JS as text, run from a `blob:` URL)
requires `script-src blob:` in the CSP and destroys debuggability. Use the
protocol handler.

### Registry and install flow

A `registry.json` on GitHub lists modules, versions, download URLs, and sha256
hashes.

- **Install:** download → verify hash → extract to app data dir → record in
  `installed.json`.
- **Update:** download alongside, swap the pointer, retain the previous version
  for rollback.
- **Uninstall:** remove the directory; prompt before dropping its IndexedDB.
- **First run:** a "choose your tools" wizard. Chat is pre-checked but can be
  unchecked.

### Context bus

The original `query(moduleId, question)` conflates two different things. Split:

```ts
publish(key, value)                              // "iris-code:activeProject"
subscribe(key, fn)                               // shared reactive state
provide(key, (q: string) => Promise<Snippet[]>)  // a module registers a retriever
ask(key, query): Promise<Snippet[]>              // another module queries it
```

`iris-read` calls `provide('docs', …)`. Chat calls `ask('docs', query)` for RAG
and gets nothing if no provider is registered. `iris-code` calls
`provide('code', q => searchCodeGraph(q))`, which is what makes "refactor this
function" work from the chat window.

### Storage

Each module receives a `NamespacedDB` bound to `iris-<moduleId>`; it cannot open
another module's database. Global search iterates registered providers — this is
a fan-out and merge in JS, **not** a cross-database join. IndexedDB has no such
thing.

## Core / module split

**Core (the shell — always present):**
Ollama client · model management (Models page, HF browser, pull/delete, hardware
hints) · theme system · storage, namespacing, backup/restore · Settings shell ·
speech services (ASR/TTS) · personas + prompt library · token/stats metering ·
command palette and window chrome · context bus.

**iris-chat (module):**
HomeScreen · MessageList · Message · ChatInput · Markdown · ContextMeter ·
`useChat` · conversations store · exporters.

**Parked (extracted later, after the SDK is proven):**
Arena → `iris-bench`. Knowledge → `iris-read`.

The rule: something is **core** if more than one module would plausibly need it,
or if it is an OS-level concern. Everything else is a module.

## Milestones

Every expensive thing rides on infrastructure a cheap thing already proved.

**M0 — Spikes.** Gates, not tasks. An afternoon each.
1. Stream one Ollama `/api/chat` response through Tauri's HTTP plugin.
2. Dynamically import a 50-line hello-world module over the custom protocol;
   confirm it renders with the shell's React and reads the shell's theme.

**M1 — Tauri migration (v2.0).** Today's app as a desktop binary. No shell, no
modules. Deliberately boring diff.

**M2 — Carve the shell; Chat becomes a module (v2.1).** Extract core behind
`@iris/sdk`; rebuild chat as a module compiled against it. **Wired in statically
— no loader yet**, so a failure is unambiguously an SDK problem. User-visible
change: none.

**M3 — Loader, registry, install wizard (IrisOS v1).** Chat is published to the
registry and becomes genuinely uninstallable. Users choose their tools.

**M4 — IrisCode**, the first module built rather than extracted.

**M5 — The context bridge earns its keep.** Chat can `ask('code', …)`.

Arena → iris-bench and Knowledge → iris-read are extracted opportunistically
once M3 lands; each should be mechanical.

## Risks

1. **Ollama streaming through Tauri's HTTP plugin.** Chat streaming is the core
   loop. If it cannot stream token-by-token, the transport design changes and
   M1 changes with it. **Spike before writing migration code.**
2. **Shared React across the module boundary.** See above. Prove on a toy module
   before IrisCode depends on it.
3. **Tauri's default CSP blocks `@huggingface/transformers`** from downloading
   Whisper model weights at runtime (`src/lib/whisper.ts:30` spawns the worker;
   the worker fetches from huggingface.co). A `connect-src` allowlist entry —
   but it fails at runtime, not build time, so it needs an explicit smoke test.
4. **Signing.** macOS notarization needs a paid Apple developer account; Windows
   shows a SmartScreen warning without a certificate. Tedium and cost, not
   technical risk.

## Migration path for existing users

A desktop app is a new origin, so IndexedDB starts empty. `src/lib/backup.ts`
already exposes `exportAll()`, `validateBackup()`, and `importAll()`, wired into
Settings → Data. The path is: export JSON from the web app, import into the
desktop app. **Zero new code** — just a first-run prompt offering it.

## Definition of done for M1

The app runs. Launch the desktop build, stream a chat completion, record a voice
note through Whisper, import a backup from the web version. Not "cargo build
succeeded".

## Out of scope

Permission model · module sandboxing · third-party module authoring · model
scheduler · multi-version module API support · inter-module `dependsOn` · the web
build · IrisShell (system agent).
