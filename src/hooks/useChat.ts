import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, Effort, OllamaModel, OllamaStatus } from '../types'
import { DEFAULT_TEMPERATURE, EFFORT_PROMPTS } from '../constants'
import { fetchModels, isAbortError, streamChat } from '../lib/ollama'

/**
 * All chat state lives here as plain React state — no store, no persistence.
 * The component tree stays thin: App wires this hook's values into the UI.
 */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [models, setModels] = useState<OllamaModel[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [status, setStatus] = useState<OllamaStatus>('checking')
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [effort, setEffort] = useState<Effort>('balanced')
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE)

  const abortRef = useRef<AbortController | null>(null)

  /** Probe Ollama and reconcile status + model list. Never throws. */
  const refresh = useCallback(async () => {
    setStatus('checking')
    try {
      const list = await fetchModels()
      setModels(list)
      if (list.length === 0) {
        setStatus('no-models')
        setSelectedModel('')
      } else {
        setStatus('online')
        setSelectedModel((prev) =>
          prev && list.some((m) => m.name === prev) ? prev : list[0].name,
        )
      }
    } catch {
      setStatus('offline')
      setModels([])
      setSelectedModel('')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming || status !== 'online' || !selectedModel) return

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const assistantId = crypto.randomUUID()
    const history = [...messages, userMsg]

    setMessages([...history, { id: assistantId, role: 'assistant', content: '' }])
    setInput('')
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    const apiMessages = [
      { role: 'system', content: EFFORT_PROMPTS[effort] },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ]

    const appendToAssistant = (chunk: string) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
      )
    const replaceAssistant = (content: string) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content } : m)))

    let received = false
    try {
      await streamChat({
        model: selectedModel,
        messages: apiMessages,
        temperature,
        signal: controller.signal,
        onToken: (chunk) => {
          received = true
          appendToAssistant(chunk)
        },
      })
    } catch (err) {
      if (isAbortError(err)) {
        if (!received) replaceAssistant('_Stopped._')
      } else {
        const detail = err instanceof Error ? err.message : 'Unknown error'
        replaceAssistant(
          `⚠️ **Couldn't reach Ollama.** ${detail}\n\nMake sure Ollama is running and the selected model is available, then try again.`,
        )
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [input, isStreaming, status, selectedModel, messages, effort, temperature])

  /** Stop any active stream, then wipe the transcript. Keeps model + controls. */
  const clearChat = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
  }, [])

  return {
    messages,
    models,
    selectedModel,
    status,
    input,
    isStreaming,
    effort,
    temperature,
    setInput,
    setSelectedModel,
    setEffort,
    setTemperature,
    send,
    stop,
    clearChat,
    refresh,
  }
}
