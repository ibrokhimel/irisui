import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, Effort, OllamaModel, OllamaStatus } from '../types'
import { DEFAULT_TEMPERATURE, EFFORT_PROMPTS } from '../constants'
import { fetchModels, isAbortError, streamChat } from '../lib/ollama'
import { getStore } from '../lib/store'
import type { Conversation, ConversationMeta } from '../lib/store'
import { download, slugify, toJSON, toMarkdown } from '../lib/exporters'
import { loadModelPrefs } from '../lib/modelPrefs'

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
          const model = pref && list.some((m) => m.name === pref) ? pref : list[0].name
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

  /** Stream an assistant reply for `history` within conversation `base`. */
  const run = useCallback(
    async (base: Conversation, history: ChatMessage[], title: string) => {
      const assistantId = crypto.randomUUID()
      const now = Date.now()

      setCurrent({
        ...base,
        title,
        updatedAt: now,
        messages: [...history, { id: assistantId, role: 'assistant', content: '' }],
      })
      setIsStreaming(true)
      // Persist the user turn immediately (survives a mid-stream crash / close).
      void persist({ ...base, title, updatedAt: now, messages: history })

      const controller = new AbortController()
      abortRef.current = controller
      const apiMessages = [
        { role: 'system', content: EFFORT_PROMPTS[base.effort] },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ]

      // Only mutate the visible conversation if the user hasn't switched away.
      const applyContent = (content: string) =>
        setCurrent((c) =>
          c.id === base.id
            ? { ...c, messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content } : m)) }
            : c,
        )

      let content = ''
      let received = false
      try {
        await streamChat({
          model: base.model,
          messages: apiMessages,
          temperature: base.temperature,
          signal: controller.signal,
          onToken: (chunk) => {
            received = true
            content += chunk
            applyContent(content)
          },
        })
      } catch (err) {
        if (isAbortError(err)) {
          if (!received) content = '_Stopped._'
        } else {
          content = toErrorMessage(err)
        }
        applyContent(content)
      } finally {
        setIsStreaming(false)
        abortRef.current = null
        void persist({
          ...base,
          title,
          updatedAt: Date.now(),
          messages: [...history, { id: assistantId, role: 'assistant', content }],
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
    await run(base, history, title)
  }, [input, isStreaming, status, run])

  const regenerate = useCallback(async () => {
    const base = currentRef.current
    if (isStreaming || status !== 'online' || !base.model) return
    const history = [...base.messages]
    while (history.length && history[history.length - 1].role === 'assistant') history.pop()
    if (history.length === 0) return
    await run(base, history, base.title)
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

  // ── conversation management ──
  const newChat = useCallback(() => {
    abortRef.current?.abort()
    const pref = loadModelPrefs().defaultModel
    const model =
      pref && models.some((m) => m.name === pref)
        ? pref
        : currentRef.current.model || models[0]?.name || ''
    setCurrent(newConversation(model))
    setInput('')
  }, [models])

  const selectChat = useCallback(
    async (id: string) => {
      if (id === currentRef.current.id) return
      abortRef.current?.abort()
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
    // history
    metas,
    search,
    setSearch,
    // ui
    input,
    setInput,
    isStreaming,
    // per-chat setters
    setSelectedModel,
    setEffort,
    setTemperature,
    // actions
    send,
    stop,
    regenerate,
    newChat,
    selectChat,
    renameChat,
    deleteChat,
    exportChat,
  }
}
