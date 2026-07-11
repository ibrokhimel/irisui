# IrisUI

**A local-first AI workspace for [Ollama](https://ollama.com).** Chat with local models, manage them, measure them, chat with your own documents, and build a studio of personas and prompts — all on your machine. No accounts, no cloud, no telemetry.

React 18 · Vite · TypeScript (strict) · Tailwind v4 · IndexedDB · Ollama HTTP API

---

## Quick start

You need [Node.js](https://nodejs.org) 20.19+ and [Ollama](https://ollama.com/download) installed.

```bash
npm install
npm run dev:ollama
```

`dev:ollama` checks whether Ollama is running, starts it if it isn't, waits until it's ready, then launches the app — and shuts Ollama down cleanly on `Ctrl+C`. If you already have Ollama running, `npm run dev` is enough.

Then open the app, pull a model from the **Models** page (start with something small like `qwen2.5:0.5b`), and start chatting.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server (assumes Ollama is already running). |
| `npm run dev:ollama` | Start Ollama if needed, wait for it, then start the dev server. |
| `npm run build` | Type-check (`tsc`) and build for production. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the unit-test suite (Vitest). |

## What's in it

A short tour — see **[docs/FEATURES.md](docs/FEATURES.md)** for the complete list.

- **Chat** — streaming replies, markdown with syntax-highlighted code, regenerate, continue-in-place, stop-and-keep-partial, and a real per-response stat line (`249.9 tok/s · first token 278ms`).
- **Models** — a full Ollama model manager: install by name or from the Ollama library / live Hugging Face search, live download progress with speed and ETA, background pulls, benchmarks, and delete.
- **Knowledge (local RAG)** — upload `.txt` / `.md` / `.json` / `.csv`, embed them locally via Ollama (`all-minilm`), attach a knowledge base to a chat, and get answers with clickable citations.
- **Studio** — personas (name, emoji, system prompt, default model/effort/temperature) and a reusable prompt library.
- **Arena** — run 2–3 models on the same prompt side by side, streaming, with per-column stats.
- **Stats** — every generation is measured from Ollama's own timing data: tokens/sec over time, average speed per model, response-time history.
- **Appearance** — Light / Dark / Wine themes, accent colors, and a spring-based motion system that genuinely respects `prefers-reduced-motion`.

## Configuration

By default IrisUI talks to Ollama at `http://localhost:11434`. To point it somewhere else, use **Settings → Connection**, which has a *Test connection* button that verifies the host live. Leave it empty to use the default.

## Your data

Everything lives in IndexedDB on your machine — conversations, messages, stats, knowledge bases and their vectors, personas, prompts, preferences. The only outbound requests are ones you explicitly trigger: downloading a model, or browsing the Hugging Face catalog.

**Settings → Data** can export all of it to a single JSON file (that file is your complete backup), import it back (validated whole before a single byte is written), or delete every trace.

## Project layout

```
src/
  components/   UI — chat, models, knowledge, studio, arena, stats, settings
  hooks/        stateful logic (useChat, useArena, useKbs, useTheme, …)
  lib/          core — ollama client, storage, RAG, stats, voice, theming
  workers/      whisper (on-device speech-to-text)
scripts/        start-ollama-dev.mjs — the dev:ollama launcher
tests/lib/      Vitest unit tests (23 files, 180+ cases)
docs/           FEATURES.md and design docs — see docs/README.md
```

## Status

**v1.0 — shipped.** The web app above is complete and on `main`.

**Desktop (Tauri) — in progress.** A native desktop build is being developed on the `feat/tauri-migration` branch and is *not yet merged into `main`*. It unlocks what a browser can't do honestly: real hardware detection (GPU / VRAM / disk), native Ollama lifecycle management, and system-tray integration. Cloning `main` today gives you the web app.

## Contributing

`main` is protected: it takes changes through pull requests, and force-pushes and deletion are blocked. Branch off `main`, open a PR, and make sure `npm run build` and `npm test` both pass.

## Docs

- **[docs/FEATURES.md](docs/FEATURES.md)** — the complete, honest feature list.
- **[docs/README.md](docs/README.md)** — index of design docs and implementation plans.
