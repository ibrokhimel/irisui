# IrisUI v1.0.0 — Complete Feature List

**A local-first AI workspace for Ollama.** Chat with local models, manage them, measure them, chat with your own documents, and build a studio of personas and prompts — all on your machine. No accounts, no cloud, no telemetry.

- **Repo:** https://github.com/ibrokhimel/irisui
- **Stack:** React 18 · Vite · TypeScript (strict) · Tailwind v4 · IndexedDB · Ollama HTTP API
- **Run:** `npm run dev:ollama` (starts Ollama, then the app) or `npm run dev`

---

## 1. Chat

The core loop: open, pick a model, ask, watch it stream.

| Feature | What it does |
|---|---|
| **Streaming responses** | Replies stream in token-by-token from Ollama (`/api/chat`, newline-delimited JSON). Malformed chunks never crash the UI. |
| **Markdown rendering** | Full GitHub-flavored markdown: headings, bold/italic, lists, tables, blockquotes, links, horizontal rules, inline code. |
| **Syntax-highlighted code** | Fenced code blocks with language detection and a dark code theme. |
| **Copy code block** | Hover any code block → copy button (with the language labelled). |
| **Copy message** | Copy an entire assistant reply to the clipboard. |
| **Regenerate** | Re-run the last user turn to get a different answer. |
| **Continue response** | If a reply was stopped or ended early, resume it *in place* — the partial answer is sent back so the model continues where it left off. |
| **Read aloud** | Text-to-speech on any assistant message (browser TTS, with a stop toggle). |
| **Stop generation** | Cancels the stream instantly and **keeps the partial text**. Also bound to `Escape`. |
| **Effort presets** | Fast / Balanced / Deep / UltraThink — implemented honestly as *system-prompt presets* (Ollama has no real "effort" flag, so IrisUI doesn't pretend it does). |
| **Temperature** | 0.0–2.0 slider (default 0.7), sent to Ollama as a real generation option. |
| **Model picker** | Choose the model right in the composer, with a live connection status dot. Favorited models float to the top. |
| **Per-response stats** | Every reply is labelled with its real speed, e.g. `qwen2.5:0.5b · 249.9 tok/s · first token 278ms · total 3.2s`. |
| **Smart input** | Auto-growing textarea, `Enter` to send, `Shift+Enter` for a newline. |
| **Smart auto-scroll** | Follows the stream without fighting you when you scroll up. |
| **Home screen** | Time-aware greeting ("Good evening"), the animated IRIS mark, and quick-start prompt chips (Write / Create / Learn / Code / Summarize). |
| **Honest error states** | "Ollama offline" vs. an actual Ollama error are distinguished — e.g. chatting with an embedding model explains *why* it can't reply and tells you to pick a chat model. |

---

## 2. Chat History & Memory

Conversations survive refresh, restart, and reboot — stored locally in IndexedDB.

| Feature | What it does |
|---|---|
| **Saved conversations** | Every chat is persisted locally. Leave and come back. |
| **Sidebar history** | Grouped by recency: Today / Yesterday / Previous 7 days / Older. |
| **Auto-titles** | A chat names itself from your first message. |
| **Rename** | Inline rename from the chat's ⋯ menu. |
| **Delete** | Remove a chat (with its messages). |
| **Search chats** | Filter your history by title as you type. |
| **Per-chat settings** | Each chat remembers its own model, effort, and temperature. |
| **Export as Markdown** | Download a clean, readable transcript. |
| **Export as JSON** | Download the full-fidelity conversation (messages, stats, sources). |
| **New Chat** | Starts fresh, using your default model and default effort/temperature. |

---

## 3. Models — the Model Manager

A full Ollama model manager, not just a dropdown.

### Installed models
| Feature | What it does |
|---|---|
| **Model list** | Every installed model with size, modified date, parameter count, and quantization. |
| **RAM estimate** | An approximate "≈10 GB RAM" figure per model, derived from its size (labelled as an estimate — no fake precision). |
| **Model details** | Expand a row for full metadata from Ollama (`/api/show`). |
| **Benchmark** | Measures **real** tokens/sec and time-to-first-token by running a short generation — the numbers come from Ollama's own timing data, never invented. |
| **Set default** | The model new chats start with. |
| **Favorites** | Star models; favorites appear first in the chat picker. |
| **Search installed** | Filter your installed models. |
| **Delete** | Removes a model from disk, behind a confirmation dialog. |
| **Refresh** | Re-read the installed list. |

### Installing models
| Feature | What it does |
|---|---|
| **Pull by name** | Install any model by exact name — including Hugging Face repos (`hf.co/user/repo`). |
| **Download progress** | Live percent, downloaded/total size, **download speed (MB/s)**, and **ETA**. |
| **Background pulls** | Navigate away mid-download — it keeps going, with a live progress badge on the sidebar's Models item. |
| **Cancel** | Abort a download in progress. |
| **Error states** | Failed pulls surface Ollama's actual reason. |

### Discovering models
| Feature | What it does |
|---|---|
| **Ollama Library** | A curated catalog (~45 models) with category filters — General, Code, Reasoning, Vision, Embedding, Small — plus search. One-click install. |
| **Hugging Face (live)** | Searches the real Hugging Face API for GGUF models: shows downloads and likes, **infinite scroll** through the full catalog, and installs any of them via `ollama pull hf.co/…`. |

---

## 4. Hardware Intelligence

Answers "what can *my* machine actually run?"

| Feature | What it does |
|---|---|
| **RAM profile** | Pick your RAM tier (8 / 16 / 32 / 64 / 128 GB), remembered between sessions. Browser detection is used only as a hint — and IrisUI is upfront that browsers under-report RAM. |
| **Recommendations** | Curated picks for your machine across five categories: **Best overall · Fastest · Coding · Reasoning · Low RAM** — each installable in one click. Never recommends a model your machine can't run. |
| **Fit badges** | Every installed model is labelled **Runs well** / **Tight fit** / **Too large** for your RAM. Updates instantly when you change your RAM tier. |

*(GPU/VRAM/disk detection is deliberately absent — a browser cannot read them honestly. That belongs to a future desktop build.)*

---

## 5. Performance Dashboard (Stats)

Every generation is measured — from Ollama's real metrics, never estimated.

| Feature | What it does |
|---|---|
| **Per-response stat line** | Under each reply: model, tokens/sec, time-to-first-token, total time. |
| **Summary cards** | Total generations · Most-used model · Fastest model. |
| **Tokens/sec over time** | Line chart of your generation speed history. |
| **Average speed per model** | Bar chart comparing your installed models. |
| **Response time history** | Line chart of total response durations. |
| **Recent generations table** | Model, tok/s, first token, total, token count, timestamp. |
| **Clear history** | Wipe stats (chats are untouched), behind a confirmation. |
| **Arena feeds in** | Comparison runs are real generations, so they're recorded here too. |

---

## 6. Knowledge & Local RAG

Chat with your own documents. Everything — parsing, embedding, search — happens on your machine.

| Feature | What it does |
|---|---|
| **Knowledge bases** | Create and delete named collections of documents. |
| **File upload** | `.txt`, `.md`, `.json`, `.csv` — chunked intelligently (breaking at paragraph/sentence boundaries, not mid-word). |
| **Local embeddings** | Text is embedded via Ollama (`all-minilm` by default) — no data leaves the machine. |
| **One-click setup** | If the embedding model isn't installed, a single button pulls it (~46 MB). |
| **Indexing progress** | Per-file progress; a failing file doesn't abort the rest of the batch. |
| **Attach to a chat** | Pick a knowledge base from the composer — that conversation becomes grounded in it. |
| **Retrieval** | Your question is embedded and matched (cosine similarity) against the document chunks; the best excerpts are handed to the model as context. |
| **Citations** | Answers carry numbered source chips — click one to expand the exact excerpt it used. |
| **Graceful degradation** | If retrieval fails for any reason, the chat still works — it just answers without documents. |

---

## 7. Studio — Personas & Prompts

| Feature | What it does |
|---|---|
| **Personas** | Create characters/assistants with a name, emoji, system prompt, and default model / effort / temperature. |
| **Persona-driven chat** | A persona's system prompt takes over from the effort preset — one click starts a chat as that persona. |
| **Persona chip** | The active persona shows in the composer and can be cleared. |
| **Prompt library** | Reusable prompts, with starters included (Coding reviewer, Summarizer, Study tutor, Brainstormer). Create your own. |
| **One-click use** | Insert any saved prompt straight into the composer. |

---

## 8. Model Arena

| Feature | What it does |
|---|---|
| **Head-to-head** | Run **2–3 models on the same prompt at once**, streaming side by side. |
| **Per-column stats** | Each model's real tok/s, time-to-first-token and total time, shown under its answer. |
| **Shared controls** | One effort setting and temperature across the run, so it's a fair fight. |
| **Stop all** | Cancels every column at once. |
| **Error isolation** | If one model fails, the others keep streaming. |
| **Crown the winner** | Mark the best answer — the winning column gets highlighted. |

---

## 9. Command Palette, Shortcuts & Voice

| Feature | What it does |
|---|---|
| **Command palette** | `Ctrl/Cmd + K` — search and jump: new chat, any page (Models/Knowledge/Studio/Arena/Stats), settings, toggle sidebar, stop generating. Full keyboard navigation. |
| **New chat** | `Ctrl/Cmd + Shift + O`. |
| **Stop generating** | `Escape` (aware of open dialogs, so it never fires underneath one). |
| **Voice input** | Push-to-talk microphone — speak, and the transcript lands in the composer. |
| **Read aloud** | Speaks assistant replies. |
| *(Voice is feature-detected: on browsers without Web Speech support, the buttons simply don't appear.)* | |

---

## 10. Appearance, Brand & Motion

| Feature | What it does |
|---|---|
| **Themes** | **Light**, **Dark**, and **Wine** presets. |
| **Accent color** | Eight swatches plus a custom color picker — the whole app recolors live (text contrast is auto-adjusted to stay readable). |
| **Persisted** | Your theme and accent survive reloads; palette swaps cross-fade rather than snap. |
| **IRIS identity** | The aperture-hex mark plus the letterspaced IRIS wordmark. |
| **Motion system** | A single spring vocabulary across the app: the mark *draws itself in* on the home screen, the assistant's aperture **rotates while generating**, chat history glides on reorder, the active-chat highlight slides between rows, modals spring in, stat numbers count up, charts draw themselves. |
| **Reduced motion** | Fully respected as a real code path — if your OS asks for less motion, animations are genuinely disabled, not just shortened. |

---

## 11. Settings & Your Data

| Section | What it does |
|---|---|
| **Appearance** | Theme preset + accent color. |
| **Chat defaults** | Default effort and temperature for new chats (default model is set from the Models page). |
| **Connection** | Point IrisUI at a custom Ollama host URL, with a **Test connection** button that verifies it live. Empty = the built-in default. |
| **Data → Export all** | One JSON file containing *everything*: conversations, messages, stats, knowledge bases and their vectors, personas, prompts, and preferences. That file is your complete backup. |
| **Data → Import** | Restore a backup. Deeply validated before a single byte is written — a corrupt or hostile file is rejected whole, never partially applied. |
| **Data → Delete all** | Wipes every trace from your machine, behind a danger confirmation, and guards against in-flight writes sneaking data back in. |

---

## 12. Privacy & Design Principles

- **Local-first.** Prompts, replies, chats, documents, embeddings, and stats never leave your machine. No accounts, no sync, no telemetry.
- **The only outbound requests** are ones you explicitly trigger: downloading a model, or browsing the Hugging Face catalog.
- **No fake features.** If Ollama doesn't support something, IrisUI doesn't pretend it does — "effort" is an honest system prompt, stats come from Ollama's real timings, and RAM advice is clearly labelled an estimate.
- **Nothing destructive is hidden.** Deleting a model, a chat, or all your data always asks first.

---

## 13. Under the Hood

- **Storage:** IndexedDB behind a swappable `ChatStore` interface — a SQLite backend can drop in for a future desktop build without touching the UI.
- **Ollama access:** a Vite dev proxy makes API calls same-origin (so CORS can never break it); a second proxy handles Hugging Face.
- **Dev script:** `npm run dev:ollama` checks whether Ollama is installed and running, starts it if needed, waits for it to be ready, then launches the app — and shuts it down cleanly on `Ctrl+C`.
- **Quality:** TypeScript strict mode, **146 unit tests**, code-split bundle (charts load only when you open Stats).

---

## Roadmap — What's Next

Nine of ten planned versions are shipped (v0.1 → v1.0). The one remaining:

**v0.7 "Shell" — Desktop app (Tauri).** Blocked only on a local toolchain (Rust + MSVC build tools). It would unlock: native Ollama auto-start/stop, real hardware detection (GPU/VRAM/disk), SQLite storage, native file access, and system tray. The codebase is already built for it — the storage interface and the configurable Ollama host are the seams it plugs into.

Beyond that: benchmark lab, coding workspace with project context, vision/image support, and folders/projects.
