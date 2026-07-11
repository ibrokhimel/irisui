import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, Effort, OllamaModel, OllamaStatus } from '../types'
import { DEFAULT_TEMPERATURE } from '../constants'
import { fetchModels, isAbortError, streamChat } from '../lib/ollama'
import { getStore } from '../lib/store'
import type { Conversation, ConversationMeta } from '../lib/store'
import { download, slugify, toJSON, toMarkdown } from '../lib/exporters'
import { loadModelPrefs } from '../lib/modelPrefs'
import { isLikelyEmbeddingModel } from '../lib/modelCatalog'
import { computeStat, toMessageStat } from '../lib/stats'
import type { MessageStat } from '../lib/stats'
import { addStat } from '../lib/statsStore'
import { retrieveContext } from '../lib/retrieve'
import type { RagContext } from '../lib/retrieve'
import { resolveSystemPrompt } from '../lib/personaPrompt'
import type { Persona } from '../lib/studioStore'

function newConversation(model: string): Conversation {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    model,
    effort: 'balanced',
    temperature: DEFAULT_TEMPERATURE,
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

  const persist = useCallback(
    async (conv: Conversation) => {
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
        setCurrent((c) => {
          if (c.model && list.some((m) => m.name === c.model)) return c
          const pref = loadModelPrefs().defaultModel
          // Never auto-select an embedding model as the chat model.
          const chatable = list.filter((m) => !isLikelyEmbeddingModel(m.name))
          const fallback = (chatable[0] ?? list[0]).name
          const model = pref && list.some((m) => m.name === pref) ? pref : fallback
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
      const t0 = performance.now()
      let firstTokenAt = 0
      let messageStat: MessageStat | undefined
      try {
        const meta = await streamChat({
          model: base.model,
          messages: apiMessages,
          temperature: base.temperature,
          signal: controller.signal,
          onToken: (chunk) => {
            if (!firstTokenAt) firstTokenAt = performance.now()
            received = true
            content += chunk
            applyContent(content)
          },
        })
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
    [persist],
  )

  const send = useCallback(async () => {
    const text = input.trim()
    const base = currentRef.current
    if (!text || isStreaming || status !== 'online' || !base.model) return
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
  }, [input, isStreaming, status, run, models])

  const regenerate = useCallback(async () => {
    const base = currentRef.current
    if (isStreaming || status !== 'online' || !base.model) return
    const history = [...base.messages]
    while (history.length && history[history.length - 1].role === 'assistant') history.pop()
    if (history.length === 0) return
    await run(base, history, base.title)
  }, [isStreaming, status, run])

  /** Resume generation on the last assistant message (e.g. after Stop, or a short reply). */
  const continueResponse = useCallback(async () => {
    const base = currentRef.current
    if (isStreaming || status !== 'online' || !base.model) return
    const last = base.messages[base.messages.length - 1]
    if (!last || last.role !== 'assistant' || !last.content) return
    await run(base, base.messages, base.title, { continueFrom: last.id })
  }, [isStreaming, status, run])

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
    const model =
      pref && models.some((m) => m.name === pref)
        ? pref
        : currentRef.current.model || chatable[0]?.name || models[0]?.name || ''
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
      const model =
        persona.defaultModel && models.some((m) => m.name === persona.defaultModel)
          ? persona.defaultModel
          : pref && models.some((m) => m.name === pref)
            ? pref
            : chatable[0]?.name || models[0]?.name || ''
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
        const model = models.some((m) => m.name === conv.model)
          ? conv.model
          : models[0]?.name || conv.model
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
    // per-chat setters
    setSelectedModel,
    setEffort,
    setTemperature,
    setKb,
    clearPersona,
    // actions
    send,
    stop,
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
