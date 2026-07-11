# Multi-Provider — Handoff

**Written:** 2026-07-12, mid-execution.
**Read this before touching anything.** It records what is done, what is half-done, and what a fresh session must *not* assume.

---

## Where the work lives

| | |
|---|---|
| **Worktree** | `C:\Users\User\Documents\irisui-multiprovider` (a `git worktree`, not a clone) |
| **Branch** | `feat/multi-provider`, cut from `main` @ `ed34c8f` |
| **Main checkout** | `C:\Users\User\Documents\irisui` — on `feat/tauri-migration`, **another agent is working there. Do not touch it.** |
| **Spec** | `docs/superpowers/specs/2026-07-12-multi-provider-design.md` |
| **Plan** | `docs/superpowers/plans/2026-07-12-multi-provider.md` — 12 tasks |
| **Ledger** | `.superpowers/sdd/progress.md` (git-ignored scratch; `git clean -fdx` destroys it) |

⚠️ **`origin/feat/multi-provider` is at `7c98f81` — only the spec and plan are pushed. All four task commits below are LOCAL ONLY.** Push before doing anything destructive.

```
9012b63  feat(keys): server-side key store; list never returns key material     <- Task 4  ✅
6e16585  refactor(stats): consume provider-neutral ChatUsage; providerId+cost   <- Task 3  ✅
40bf421  fix: savePriceOverride resilience & add pricing test coverage          <- Task 2 fix
dbe5ff3  feat(providers): dated price table and cost math                       <- Task 2  ✅
542f30e  feat(providers): qualified model refs, split on the first colon only   <- Task 1  ✅
7c98f81  docs(plan): ...        <- pushed
a4c7823  docs(spec): ...        <- pushed
```

**Current state:** 251 tests passing, `npm run build` clean.

---

## Status: 4 done, 1 half-done, 7 not started

### ✅ Tasks 1–4 — complete, reviewed, committed

Each was implemented by a subagent, reviewed by a separate subagent against the brief, and fixed where the review found problems.

- **Task 1 — `src/lib/providers/modelRef.ts`.** Qualified model refs (`ollama:qwen2.5:0.5b`). Splits on the **first colon only**, because Ollama names contain colons. An unprefixed ref parses to Ollama — this is load-bearing: it is why no data migration is needed for values already in users' storage.
- **Task 2 — `src/lib/providers/pricing.ts`, `cost.ts`.** Dated seed price table, user-overridable, plus cost math. **Unknown price yields `undefined`, never `0`.** Review found and fixed two Important bugs (see below).
- **Task 3 — `src/lib/providers/types.ts`, rewrote `src/lib/stats.ts`.** Cut the `lib/ollama` import out of `stats.ts` — the one place Ollama leaked into the domain model. `ChatUsage` makes Ollama's nanosecond timings optional; cloud providers fall through to the wall-clock branch that already existed. `useChat`/`useArena` got a **minimal** typecheck fix only — Task 11 replaces those call sites properly.
- **Task 4 — `vite/keyStore.ts`.** Server-side key storage. `listKeys` returns only `{ id, suffix }`; the reviewer confirmed the no-leak test genuinely proves it (exact `toEqual`, not a shape check a leaky implementation could satisfy). `isLoopbackHost` is the guard against `vite --host` exposing the user's keys to the LAN.

### 🟡 Task 5 — HALF DONE. Uncommitted, unreviewed, unverified.

**A subagent was interrupted mid-task.** Its files are written and **staged but not committed**:

```
A  vite/providerProxyPlugin.ts
A  tsconfig.node.json
A  tests/vite/providerProxyPlugin.test.ts
M  vite.config.ts
M  package.json          ("build": "tsc && tsc --noEmit -p tsconfig.node.json && vite build")
```

The suite passes (251) and the build is clean **with these files in the tree**. But treat this work as **unverified**:

- It was **never reviewed**.
- It **never wrote a report** (`.superpowers/sdd/task-5-report.md` does not exist).
- **The security verifications were never run.** These are the whole point of the task and are still owed:
  1. `GET /api/keys` after storing a key returns the masked suffix and **not** the key.
  2. `.keys.local.json` does not appear in `git status`.
  3. A `vite --host` bind gets a **403** and logs why.

**Recommendation:** do not trust it. Either review it properly, or `git reset` and redo Task 5 from the brief.

### ⬜ Tasks 6–12 — not started

6. Ollama adapter · 7. Shared SSE reader · 8. OpenAI adapter · 9. Anthropic adapter · 10. Registry + browser key client · 11. Route chat through the registry · 12. Provider UI (picker + Settings tab)

Full text for each is in the plan. Extract a task's brief with:

```bash
bash "C:/Users/User/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/subagent-driven-development/scripts/task-brief" \
  docs/superpowers/plans/2026-07-12-multi-provider.md 6
```

---

## Extra requirement added mid-flight (not in the plan)

Task 4's review found that **`tsconfig.json` has `"include": ["src"]`, so the entire `vite/` directory — including the security-critical key code — was never typechecked by `npm run build`.**

The fix was folded into Task 5: a `tsconfig.node.json` scoped to `vite/` (Node libs, **no DOM**, because `vite/` is Node code while `src/` is browser code — naively widening the existing `include` causes lib conflicts), wired in as `tsc --noEmit -p tsconfig.node.json` in the build script.

Those files exist in the staged Task 5 work. **Nobody has confirmed the gate actually catches a type error in `vite/`.** Prove it: introduce a deliberate type error there, watch `npm run build` fail, remove it.

---

## Decisions a fresh session must not re-litigate

These were settled with the user. Don't reopen them.

- **Browser-based, run via `npm run dev`.** Not a static build. This is *why* the Vite-proxy design works: the dev server is always there, so every provider is same-origin and **CORS never applies to anyone**. Desktop/Tauri is a *separate* effort by another agent on another branch.
- **Keys never enter the browser.** The dev server holds them and injects auth headers. The page posts a key once and can never read one back. This is not negotiable — it is the security model.
- **Model *management* stays Ollama-only.** Pull, delete, `/api/show`, benchmark. OpenAI has no concept of downloading a model to disk. `ModelsPage.tsx`, `ModelRow.tsx`, `useModelPull.ts` are **not touched by this work**.
- **`costUsd` absent ≠ `costUsd: 0`.** Unknown price → show no cost. Never render `$0.00` as a stand-in, and always prefix costs with `≈`.
- **Never silently fall back to another provider** on failure. Spending the user's money on a model they didn't pick is unacceptable.
- **`store.ts` needs no migration.** `Conversation.model` holds bare Ollama names; `parseModelRef` reads an unprefixed ref as Ollama, so old chats keep working untouched.

---

## Known risks — read before shipping

1. **🔴 The seed prices in `src/lib/providers/pricing.ts` are PLACEHOLDERS and are probably wrong.** They were written without access to current pricing. `PRICES_AS_OF` is `2026-07-12`. **Verify every price against each provider's own pricing page before this ships.** A cost tracker that displays confidently wrong numbers is worse than one that displays none — the user trusts the figure. The mechanism (dated, user-correctable, `≈`-prefixed) is what was built; the numbers are not yet real.

2. **`mode: 0o600` on the key file is inert on Windows.** Node only honors the owner-write bit there. The code is correct on Linux/macOS. The named threat (LAN exposure via `--host`) is closed by the loopback guard; local multi-account file permissions are not.

3. **Model names in the seed table are unverified too** (`gpt-4o`, `claude-sonnet-4-5`, …). The adapters fetch real model lists from `/v1/models` at runtime, so the table only affects *pricing lookup* — an unknown model just shows no cost, which is the safe failure.

---

## Deferred Minor findings (for the final whole-branch review to triage)

- `pricing.ts`: `loadPricing` / `savePriceOverride` duplicate the read→parse→guard shape with divergent validation.
- `pricing.ts`: bracket assignment would mishandle a literal `"__proto__"` ref (unreachable today — refs always contain a colon).
- `pricing.test.ts`: imports the `ModelPricing` type as a value import.
- `stats.ts:212,237`: `?? 0` optional-timing default repeated twice.
- `keyStore.ts`: `writeKey`/`deleteKey` duplicate the read-modify-write sequence; no concurrent-write guard on the key file.

---

## How to resume

The process is the **superpowers `subagent-driven-development`** skill: one fresh implementer subagent per task, then a separate reviewer subagent per task, fix loop until clean, then a broad whole-branch review at the end.

1. Read `.superpowers/sdd/progress.md` — **tasks it marks complete are done; do not re-dispatch them.** Trust the ledger and `git log` over any recollection.
2. Decide Task 5's fate (review the staged work, or reset and redo).
3. Continue Tasks 6→12.
4. Finish with a whole-branch review, pointing it at the deferred-Minor list above.
5. Open a PR into `main`. **`main` is protected** — PRs required, though no approvals are needed, so you can merge your own.

Helper scripts (from the skill directory):
- `scripts/task-brief PLAN_FILE N` → writes a task's brief to a file, prints the path.
- `scripts/review-package BASE HEAD` → writes commit list + stat + full diff to one file for a reviewer.
