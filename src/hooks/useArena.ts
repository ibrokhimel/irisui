import { useCallback, useEffect, useRef, useState } from 'react'
import type { Effort, OllamaModel } from '../types'
import { DEFAULT_TEMPERATURE, EFFORT_PROMPTS } from '../constants'
import { isAbortError } from '../lib/ollama'
import { resolve } from '../lib/providers/registry'
import { lookupPricing } from '../lib/providers/pricing'
import { computeStat, toMessageStat } from '../lib/stats'
import type { MessageStat } from '../lib/stats'
import { addStat } from '../lib/statsStore'
import { resizeSelection } from '../lib/arena'
import type { ArenaColumnStatus } from '../lib/arena'

const ARENA_CONVERSATION_ID = 'arena'

export interface ArenaColumn {
  model: string
  status: ArenaColumnStatus
  content: string
  error?: string
  stat?: MessageStat
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}

/**
 * Runs a prompt against 2–3 models concurrently, streaming each into its own
 * column. Ephemeral: nothing here is persisted as a conversation, but every
 * completed column still records a real GenerationStat (conversationId
 * 'arena') so the run feeds the Stats page.
 */
export function useArena(models: OllamaModel[]) {
  const [modelCount, setModelCount] = useState<2 | 3>(2)
  const [selected, setSelected] = useState<string[]>([])
  const [effort, setEffort] = useState<Effort>('balanced')
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE)
  const [prompt, setPrompt] = useState('')
  const [columns, setColumns] = useState<ArenaColumn[]>([])
  const [running, setRunning] = useState(false)
  const [winner, setWinner] = useState<number | null>(null)

  // One shared set of in-flight controllers per run — Stop aborts every column at once.
  const controllersRef = useRef<AbortController[]>([])

  // Populate defaults once models load; never clobber a choice the user already made.
  // Always resolves to exactly `modelCount` slots (padding with '' when there
  // aren't enough distinct chatable models yet) so every picker renders.
  useEffect(() => {
    setSelected((prev) => (prev.some(Boolean) ? prev : resizeSelection([], modelCount, models)))
    // Only re-run when the installed model list changes, not on every modelCount tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models])

  const setModelAt = useCallback((index: number, model: string) => {
    setSelected((prev) => {
      const next = [...prev]
      next[index] = model
      return next
    })
  }, [])

  const setCount = useCallback(
    (count: 2 | 3) => {
      setModelCount(count)
      setSelected((prev) => resizeSelection(prev, count, models))
    },
    [models],
  )

  const stop = useCallback(() => {
    controllersRef.current.forEach((c) => c.abort())
  }, [])

  const run = useCallback(async () => {
    const text = prompt.trim()
    const chosenModels = selected.slice(0, modelCount)
    if (!text || chosenModels.length < 2 || chosenModels.some((m) => !m) || running) return

    setWinner(null)
    setRunning(true)
    setColumns(chosenModels.map((model) => ({ model, status: 'streaming', content: '' })))

    const apiMessages = [
      { role: 'system', content: EFFORT_PROMPTS[effort] },
      { role: 'user', content: text },
    ]
    const controllers = chosenModels.map(() => new AbortController())
    controllersRef.current = controllers

    await Promise.all(
      chosenModels.map(async (model, i) => {
        const controller = controllers[i]
        const startedAt = Date.now()
        let content = ''
        try {
          // Route each column to the provider that serves its model; the adapter
          // measures its own timings and returns provider-neutral usage.
          const { adapter, modelId } = resolve(model)
          const usage = await adapter.streamChat({
            model: modelId,
            messages: apiMessages,
            temperature,
            signal: controller.signal,
            onToken: (chunk) => {
              content += chunk
              setColumns((prev) => {
                const next = [...prev]
                if (next[i]) next[i] = { ...next[i], content }
                return next
              })
            },
          })
          let stat: MessageStat | undefined
          if (usage.completionTokens > 0) {
            const s = computeStat({
              conversationId: ARENA_CONVERSATION_ID,
              model,
              startedAt,
              usage,
              pricing: lookupPricing(model),
            })
            stat = toMessageStat(s)
            void addStat(s)
          }
          setColumns((prev) => {
            const next = [...prev]
            if (next[i]) next[i] = { ...next[i], content, status: 'done', stat }
            return next
          })
        } catch (err) {
          if (isAbortError(err)) {
            setColumns((prev) => {
              const next = [...prev]
              if (next[i]) {
                next[i] = { ...next[i], content: content || '_Stopped._', status: 'stopped' }
              }
              return next
            })
          } else {
            setColumns((prev) => {
              const next = [...prev]
              if (next[i]) {
                next[i] = { ...next[i], content, status: 'error', error: toErrorMessage(err) }
              }
              return next
            })
          }
        }
      }),
    )

    controllersRef.current = []
    setRunning(false)
  }, [prompt, selected, modelCount, running, effort, temperature])

  const pickWinner = useCallback((index: number) => {
    setWinner((prev) => (prev === index ? null : index))
  }, [])

  return {
    modelCount,
    setCount,
    selected,
    setModelAt,
    effort,
    setEffort,
    temperature,
    setTemperature,
    prompt,
    setPrompt,
    columns,
    running,
    winner,
    pickWinner,
    run,
    stop,
  }
}
