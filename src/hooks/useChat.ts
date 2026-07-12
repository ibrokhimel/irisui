import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, Effort, OllamaModel, OllamaStatus } from '../types'
import { fetchModels, isAbortError, resolveNumCtx } from '../lib/ollama'
import { resolve } from '../lib/providers/registry'
import { lookupPricing } from '../lib/providers/pricing'
import { formatModelRef, parseModelRef } from '../lib/providers/modelRef'
import type { AutoContext } from '../lib/kvCache'
import { effectiveRamGb } from '../lib/hardware'
import { contextVerdict, projectContextUse, wasTruncated } from '../lib/contextGuard'
import type { ContextVerdict } from '../lib/contextGuard'
import { getStore } from '../lib/store'
import type { Conversation, ConversationMeta } from '../lib/store'
import { download, slugify, toJSON, toMarkdown } from '../lib/exporters'
import { loadModelPrefs } from '../lib/modelPrefs'
import { loadAppSettings } from '../lib/appSettings'
import { isLikelyEmbeddingModel } from '../lib/modelCatalog'
import { computeStat, toMessageStat } from '../lib/stats'
import type { MessageStat } from '../lib/stats'
import { addStat } from '../lib/statsStore'
import { isDataWiped } from '../lib/backup'
import { retrieveContext } from '../lib/retrieve'
import type { RagContext } from '../lib/retrieve'
import { resolveSystemPrompt } from '../lib/personaPrompt'
import type { Persona } from '../lib/studioStore'

/** The bare Ollama model name for a ref, or null if the ref names a cloud provider. */
function ollamaId(ref: string): string | null {
  const { providerId, id } = parseModelRef(ref)
  return providerId === 'ollama' ? id : null
}

/**
 * Whether a model ref is a valid choice given the installed Ollama models. A
 * cloud ref is always "usable" here — its real availability (a configured key)
 * is enforced at generation time, never by silently swapping to another model.
 * An Ollama ref is usable only when that model is actually installed.
 */
function usableRef(ref: string, installed: OllamaModel[]): boolean {
  if (!ref) return false
  const id = ollamaId(ref)
  if (id === null) return true
  return installed.some((m) => m.name === id)
}

/** New chats start from the Chat defaults in Settings — read fresh here (not at
 *  import time) so a Settings change applies to the very next chat. */
function newConversation(model: string): Conversation {
  const now = Date.now()
  const settings = loadAppSettings()
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    model,
    effort: settings.defaultEffort,
    temperature: settings.defaultTemperature,
    numCtx: settings.defaultNumCtx,
    messages: [],
  }
}

/** First user message → a short chat title. */
function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= 48 ? clean : `${clean.slice(0, 48).trimEnd()}…`
}

function toErrorMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : 'Unknown error'

  // fetch() itself failed — Ollama isn't reachable.
  if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(detail)) {
    return "⚠️ **Couldn't reach Ollama.** Make sure it's running (try `npm run dev:ollama`), then try again."
  }

  // Ollama replied but the model can't do chat (e.g. an embedding model).
  if (/does not support|not a chat|embedding|only supports/i.test(detail)) {
    return `⚠️ **This model can't be used for chat.** ${detail}\n\nEmbedding models (like \`all-minilm\` or \`nomic-embed-text\`) only turn text into vectors — pick a chat model from the selector below.`
  }

  return `⚠️ ${detail}`
}

function metaOf(c: Conversation): ConversationMeta {
  return {
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    model: c.model,
    effort: c.effort,
    temperature: c.temperature,
    numCtx: c.numCtx,
    kbId: c.kbId,
    personaId: c.personaId,
  }
}

export function useChat() {
  const store = useRef(getStore()).current

  // Global Ollama state.
  const [status, setStatus] = useState<OllamaStatus>('checking')
  const [models, setModels] = useState<OllamaModel[]>([])

  // Conversations: the sidebar list + the currently open conversation.
  const [metas, setMetas] = useState<ConversationMeta[]>([])
  const [current, setCurrent] = useState<Conversation>(() => newConversation(''))

  // UI.
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [search, setSearch] = useState('')
  // One-time inline notice: a KB is attached but its embedding model is missing.
  const [ragNotice, setRagNotice] = useState(false)

  const currentRef = useRef(current)
  useEffect(() => {
    currentRef.current = current
  }, [current])
  const abortRef = useRef<AbortController | null>(null)

  // ── context window ──
  // 'auto' can't be resolved once and stored on the conversation: the affordable
  // window depends on the model's KV geometry, and the model can change
  // mid-chat. So it re-resolves whenever the model or the setting does.
  const [ctx, setCtx] = useState<AutoContext | undefined>(undefined)
  const [summarizing, setSummarizing] = useState(false)
  const ctxRef = useRef<AutoContext | undefined>(undefined)
  ctxRef.current = ctx

  const model = current.model
  const numCtxSetting = current.numCtx ?? loadAppSettings().defaultNumCtx
  useEffect(() => {
    // Context-window sizing is Ollama-only; a cloud model (or none) has no local
    // window to resolve, so the context meter simply goes blank for it.
    const id = model ? ollamaId(model) : null
    if (!id) {
      setCtx(undefined)
      return
    }
    let cancelled = false
    const modelBytes = models.find((m) => m.name === id)?.size ?? 0
    void resolveNumCtx({
      model: id,
      setting: numCtxSetting,
      modelBytes,
      ramGb: effectiveRamGb(),
    }).then((resolved) => {
      if (!cancelled) setCtx(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [model, numCtxSetting, models])

  const persist = useCallback(
    async (conv: Conversation) => {
      if (isDataWiped()) return
      try {
        await store.put(conv)
        setMetas((prev) => {
          const others = prev.filter((m) => m.id !== conv.id)
          return [metaOf(conv), ...others].sort((a, b) => b.updatedAt - a.updatedAt)
        })
      } catch {
        /* persistence is best-effort — never block the UI */
      }
    },
    [store],
  )

  const refresh = useCallback(async () => {
    setStatus('checking')
    try {
      const list = await fetchModels()
      setModels(list)
      if (list.length === 0) {
        setStatus('no-models')
      } else {
        setStatus('online')
        // Give the open chat a valid model if it lacks one (prefer the default).
        // Ollama coming online must not clobber a cloud model the user picked, so
        // a still-usable ref (cloud, or an installed Ollama model) is kept as-is.
        setCurrent((c) => {
          if (usableRef(c.model, list)) return c
          const pref = loadModelPrefs().defaultModel
          // Never auto-select an embedding model as the chat model.
          const chatable = list.filter((m) => !isLikelyEmbeddingModel(m.name))
          const fallback = formatModelRef('ollama', (chatable[0] ?? list[0]).name)
          const model = usableRef(pref, list) ? pref : fallback
          return { ...c, model }
        })
      }
    } catch {
      setStatus('offline')
      setModels([])
    }
  }, [])

  // Load history + probe Ollama once on mount.
  useEffect(() => {
    void (async () => {
      try {
        setMetas(await store.listMeta())
      } catch {
        /* ignore */
      }
    })()
    void refresh()
  }, [store, refresh])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  /**
   * Stream an assistant reply for `history` within conversation `base`.
   * With `continueFrom` set (a message id), `history` already ends with that
   * (non-empty) assistant message — tokens are appended to it in place
   * instead of a new assistant message being started.
   */
  const run = useCallback(
    async (
      base: Conversation,
      history: ChatMessage[],
      title: string,
      opts?: { continueFrom?: string; context?: RagContext },
    ) => {
      const continueFrom = opts?.continueFrom
      const context = opts?.context
      const existing = continueFrom ? (history.find((m) => m.id === continueFrom)?.content ?? '') : ''
      const assistantId = continueFrom ?? crypto.randomUUID()
      const now = Date.now()

      const newAssistant: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        ...(context ? { sources: context.sources } : {}),
      }

      setCurrent({
        ...base,
        title,
        updatedAt: now,
        messages: continueFrom ? history : [...history, newAssistant],
      })
      setIsStreaming(true)
      // Persist the user turn immediately (survives a mid-stream crash / close).
      void persist({ ...base, title, updatedAt: now, messages: history })

      const controller = new AbortController()
      abortRef.current = controller

      const systemPrompt = await resolveSystemPrompt(base)
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        // Retrieved source excerpts, injected right after the system prompt.
        ...(context ? [{ role: 'system', content: context.systemMessage }] : []),
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ]

      // Only mutate the visible conversation if the user hasn't switched away.
      const applyContent = (content: string) =>
        setCurrent((c) =>
          c.id === base.id
            ? { ...c, messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content } : m)) }
            : c,
        )

      let content = existing
      let received = false
      let messageStat: MessageStat | undefined

      // base.model is a qualified ref (e.g. "ollama:qwen2.5:0.5b" or
      // "openai:gpt-4o-mini"); route it to the provider that serves it. modelId
      // is the provider-native name — the Ollama model list is keyed by that,
      // not the qualified ref.
      const { adapter, modelId } = resolve(base.model)

      // Context-window sizing is an Ollama-only concept. For a cloud model there
      // is nothing to resolve, and probing Ollama for a model it doesn't have
      // would just add a failing round-trip before every generation.
      let numCtx: number | undefined
      if (adapter.id === 'ollama') {
        const resolved =
          ctxRef.current ??
          (await resolveNumCtx({
            model: modelId,
            setting: base.numCtx ?? loadAppSettings().defaultNumCtx,
            modelBytes: models.find((m) => m.name === modelId)?.size ?? 0,
            ramGb: effectiveRamGb(),
          }))
        numCtx = resolved.numCtx
      }

      try {
        const usage = await adapter.streamChat({
          model: modelId,
          messages: apiMessages,
          temperature: base.temperature,
          signal: controller.signal,
          onToken: (chunk) => {
            received = true
            content += chunk
            applyContent(content)
          },
          // Ollama's num_ctx; cloud adapters ignore options they don't understand.
          providerOptions: numCtx !== undefined ? { num_ctx: numCtx } : undefined,
        })
        if (usage.completionTokens > 0) {
          const stat = computeStat({
            conversationId: base.id,
            model: base.model,
            startedAt: now,
            usage,
            pricing: lookupPricing(base.model),
          })
          // If Ollama evaluated a prompt that filled the whole window, it
          // context-shifted: this reply was generated against a conversation
          // with its oldest turns silently dropped. Mark it — the answer looks
          // perfectly normal, and only this flag reveals it isn't trustworthy.
          // Cloud providers don't context-shift this way, so the flag is Ollama-only.
          messageStat = {
            ...toMessageStat(stat),
            truncated: adapter.id === 'ollama' && wasTruncated(usage.promptTokens, numCtx ?? 0),
          }
          void addStat(stat)
        }
      } catch (err) {
        if (isAbortError(err)) {
          // Only stamp `_Stopped._` when nothing was ever in the message — for a
          // continued reply `content` already holds the prior text, so it's left as-is.
          if (!received && !content) content = '_Stopped._'
        } else {
          content = toErrorMessage(err)
        }
        applyContent(content)
      } finally {
        setIsStreaming(false)
        abortRef.current = null
        if (messageStat) {
          const s = messageStat
          setCurrent((c) =>
            c.id === base.id
              ? { ...c, messages: c.messages.map((m) => (m.id === assistantId ? { ...m, stat: s } : m)) }
              : c,
          )
        }
        void persist({
          ...base,
          title,
          updatedAt: Date.now(),
          messages: continueFrom
            ? history.map((m) => (m.id === assistantId ? { ...m, content, stat: messageStat ?? m.stat } : m))
            : [...history, { ...newAssistant, content, stat: messageStat }],
        })
      }
    },
    [persist, models],
  )

  // ── the overflow guard ──
  // The history's size is known EXACTLY (Ollama reports it); only the draft is
  // estimated, and deliberately over-estimated. See lib/contextGuard.ts.
  const lastStat = useMemo(() => {
    for (let i = current.messages.length - 1; i >= 0; i--) {
      const m = current.messages[i]
      if (m.role === 'assistant' && m.stat) return m.stat
    }
    return undefined
  }, [current.messages])

  const contextState = useMemo(() => {
    const limit = ctx?.numCtx ?? 0
    const used = (lastStat?.promptTokens ?? 0) + (lastStat?.completionTokens ?? 0)
    const tokens = {
      lastPromptTokens: lastStat?.promptTokens,
      lastCompletionTokens: lastStat?.completionTokens,
    }
    const projected = projectContextUse({ ...tokens, draft: input })
    // Regenerate/continue send no new draft, so they overflow only if the
    // history alone no longer fits.
    const historyOnly = projectContextUse({ ...tokens, draft: '' })
    return {
      used,
      limit,
      projected,
      verdict: contextVerdict(projected, limit) as ContextVerdict,
      historyFull: contextVerdict(historyOnly, limit) === 'full',
      reason: ctx?.reason,
      truncated: lastStat?.truncated === true,
    }
  }, [ctx, lastStat, input])

  const contextFull = contextState.verdict === 'full'

  const send = useCallback(async () => {
    const text = input.trim()
    const base = currentRef.current
    if (!text || isStreaming || status !== 'online' || !base.model) return
    // Refuse rather than let Ollama context-shift the oldest turns out from
    // under the user. Nothing is sent, so the model can't silently forget.
    if (contextFull) return
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const history = [...base.messages, userMsg]
    const title = base.messages.length === 0 ? deriveTitle(text) : base.title
    setInput('')

    // Fresh send only (not regenerate/continue): if a KB is attached, retrieve
    // grounding context. Any failure degrades to a normal context-free reply —
    // retrieval never blocks the chat.
    let context: RagContext | undefined
    if (base.kbId) {
      const result = await retrieveContext(
        base.kbId,
        text,
        models.map((m) => m.name),
      )
      if (result.kind === 'context') {
        context = { systemMessage: result.systemMessage, sources: result.sources }
        setRagNotice(false)
      } else if (result.kind === 'embed-missing') {
        setRagNotice(true)
      } else if (result.kind === 'error') {
        console.warn('RAG retrieval failed; answering without knowledge context')
      }
    }

    await run(base, history, title, { context })
  }, [input, isStreaming, status, run, models, contextFull])

  /**
   * Condense the conversation and carry it into a fresh chat.
   *
   * The escape hatch from a full window. The summary is LOSSY — this is not a
   * lossless carry-over, and the UI says so. It works because we blocked BEFORE
   * overflowing: the existing history still fits the window, it's only the next
   * turn that wouldn't. So the transcript can be summarized in one pass.
   */
  const summarizeAndContinue = useCallback(async () => {
    const base = currentRef.current
    if (summarizing || isStreaming || status !== 'online' || !base.model) return
    if (base.messages.length === 0) return

    setSummarizing(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const transcript = base.messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n')

      let summary = ''
      const { adapter, modelId } = resolve(base.model)
      await adapter.streamChat({
        model: modelId,
        messages: [
          {
            role: 'system',
            content:
              'You condense conversations so they can be continued in a fresh context window. ' +
              'Capture decisions, facts, names, code, and open threads. Be dense and factual. ' +
              'Do not add commentary or pleasantries.',
          },
          {
            role: 'user',
            content: `Summarize this conversation so it can be continued without losing what matters:\n\n${transcript}`,
          },
        ],
        temperature: 0.2,
        signal: controller.signal,
        onToken: (chunk) => {
          summary += chunk
        },
        providerOptions:
          adapter.id === 'ollama' && ctxRef.current ? { num_ctx: ctxRef.current.numCtx } : undefined,
      })

      if (!summary.trim()) throw new Error('empty summary')

      // Seed the new chat with the summary as a real, visible message pair
      // rather than a hidden system prompt — the user can read exactly what was
      // carried over, and correct it if the model dropped something.
      const conv = newConversation(base.model)
      const seeded: Conversation = {
        ...conv,
        title: `${base.title} (continued)`,
        effort: base.effort,
        temperature: base.temperature,
        numCtx: base.numCtx,
        kbId: base.kbId,
        personaId: base.personaId,
        messages: [
          {
            id: crypto.randomUUID(),
            role: 'user',
            content: `Summary of our conversation so far:\n\n${summary.trim()}`,
          },
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "Got it — I've got the summary. Let's continue.",
          },
        ],
      }
      setCurrent(seeded)
      setInput('')
      void persist(seeded)
    } catch (err) {
      if (!isAbortError(err)) {
        console.warn('Summarize failed; the conversation is unchanged', err)
      }
    } finally {
      setSummarizing(false)
      abortRef.current = null
    }
  }, [summarizing, isStreaming, status, persist])

  // Regenerate and continue carry no new draft, so they only overflow when the
  // history alone no longer fits — but they'd context-shift just as silently.
  const regenerate = useCallback(async () => {
    const base = currentRef.current
    if (isStreaming || status !== 'online' || !base.model) return
    if (contextState.historyFull) return
    const history = [...base.messages]
    while (history.length && history[history.length - 1].role === 'assistant') history.pop()
    if (history.length === 0) return
    await run(base, history, base.title)
  }, [isStreaming, status, run, contextState.historyFull])

  /** Resume generation on the last assistant message (e.g. after Stop, or a short reply). */
  const continueResponse = useCallback(async () => {
    const base = currentRef.current
    if (isStreaming || status !== 'online' || !base.model) return
    if (contextState.historyFull) return
    const last = base.messages[base.messages.length - 1]
    if (!last || last.role !== 'assistant' || !last.content) return
    await run(base, base.messages, base.title, { continueFrom: last.id })
  }, [isStreaming, status, run, contextState.historyFull])

  // ── per-chat settings (persist only once the chat has content) ──
  const patchCurrent = useCallback(
    (patch: Partial<Conversation>) => {
      const next = { ...currentRef.current, ...patch }
      setCurrent(next)
      if (next.messages.length > 0) void persist(next)
    },
    [persist],
  )
  const setSelectedModel = useCallback((model: string) => patchCurrent({ model }), [patchCurrent])
  const setEffort = useCallback((effort: Effort) => patchCurrent({ effort }), [patchCurrent])
  const setTemperature = useCallback(
    (temperature: number) => patchCurrent({ temperature }),
    [patchCurrent],
  )
  const setKb = useCallback(
    (kbId: string | undefined) => {
      setRagNotice(false)
      patchCurrent({ kbId })
    },
    [patchCurrent],
  )
  const clearPersona = useCallback(() => patchCurrent({ personaId: undefined }), [patchCurrent])
  const dismissRagNotice = useCallback(() => setRagNotice(false), [])

  // ── conversation management ──
  const newChat = useCallback(() => {
    abortRef.current?.abort()
    setRagNotice(false)
    const pref = loadModelPrefs().defaultModel
    const chatable = models.filter((m) => !isLikelyEmbeddingModel(m.name))
    const fallbackName = chatable[0]?.name ?? models[0]?.name
    const model = usableRef(pref, models)
      ? pref
      : currentRef.current.model || (fallbackName ? formatModelRef('ollama', fallbackName) : '')
    setCurrent(newConversation(model))
    setInput('')
  }, [models])

  /** New chat carrying a persona's id and its defaults (model if installed, effort, temperature). */
  const newChatWithPersona = useCallback(
    (persona: Persona) => {
      abortRef.current?.abort()
      setRagNotice(false)
      const pref = loadModelPrefs().defaultModel
      const chatable = models.filter((m) => !isLikelyEmbeddingModel(m.name))
      const fallbackName = chatable[0]?.name ?? models[0]?.name
      const model =
        persona.defaultModel && usableRef(persona.defaultModel, models)
          ? persona.defaultModel
          : usableRef(pref, models)
            ? pref
            : fallbackName
              ? formatModelRef('ollama', fallbackName)
              : ''
      const conv = newConversation(model)
      setCurrent({
        ...conv,
        personaId: persona.id,
        effort: persona.defaultEffort ?? conv.effort,
        temperature: persona.defaultTemperature ?? conv.temperature,
      })
      setInput('')
    },
    [models],
  )

  const selectChat = useCallback(
    async (id: string) => {
      if (id === currentRef.current.id) return
      abortRef.current?.abort()
      setRagNotice(false)
      try {
        const conv = await store.get(id)
        if (!conv) return
        // Keep the saved model if it's still usable (cloud, or installed Ollama);
        // otherwise fall back to an installed Ollama model. resolve() reads a
        // legacy bare name as Ollama, so old conversations load unchanged.
        const model = usableRef(conv.model, models)
          ? conv.model
          : models[0]
            ? formatModelRef('ollama', models[0].name)
            : conv.model
        setCurrent({ ...conv, model })
        setInput('')
      } catch {
        /* ignore */
      }
    },
    [store, models],
  )

  const deleteChat = useCallback(
    async (id: string) => {
      try {
        await store.remove(id)
      } catch {
        /* ignore */
      }
      setMetas((prev) => prev.filter((m) => m.id !== id))
      if (currentRef.current.id === id) {
        setCurrent(newConversation(currentRef.current.model || models[0]?.name || ''))
        setInput('')
      }
    },
    [store, models],
  )

  const renameChat = useCallback(
    async (id: string, rawTitle: string) => {
      const title = rawTitle.trim() || 'Untitled'
      setMetas((prev) => prev.map((m) => (m.id === id ? { ...m, title } : m)))
      if (currentRef.current.id === id) setCurrent((c) => ({ ...c, title }))
      try {
        const conv =
          currentRef.current.id === id ? { ...currentRef.current, title } : await store.get(id)
        if (conv) await store.put({ ...conv, title })
      } catch {
        /* ignore */
      }
    },
    [store],
  )

  const exportChat = useCallback(
    async (id: string, format: 'md' | 'json') => {
      try {
        const conv = currentRef.current.id === id ? currentRef.current : await store.get(id)
        if (!conv) return
        if (format === 'md') {
          download(`${slugify(conv.title)}.md`, toMarkdown(conv), 'text/markdown;charset=utf-8')
        } else {
          download(`${slugify(conv.title)}.json`, toJSON(conv), 'application/json')
        }
      } catch {
        /* ignore */
      }
    },
    [store],
  )

  return {
    // Ollama
    status,
    models,
    refresh,
    // current conversation
    id: current.id,
    title: current.title,
    messages: current.messages,
    selectedModel: current.model,
    effort: current.effort,
    temperature: current.temperature,
    numCtx: current.numCtx,
    kbId: current.kbId,
    personaId: current.personaId,
    // history
    metas,
    search,
    setSearch,
    // ui
    input,
    setInput,
    isStreaming,
    ragNotice,
    dismissRagNotice,
    // context window
    context: contextState,
    contextFull,
    summarizing,
    // per-chat setters
    setSelectedModel,
    setEffort,
    setTemperature,
    setKb,
    clearPersona,
    // actions
    send,
    stop,
    summarizeAndContinue,
    regenerate,
    continueResponse,
    newChat,
    newChatWithPersona,
    selectChat,
    renameChat,
    deleteChat,
    exportChat,
  }
}
