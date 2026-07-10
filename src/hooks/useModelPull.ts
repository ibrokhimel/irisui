import { useCallback, useRef, useState } from 'react'
import type { PullProgress } from '../lib/ollama'
import { pullModel } from '../lib/ollama'

/**
 * Owns a single in-flight model pull. Lives at the app root (not inside the
 * Models page), so navigating away keeps the download running and its progress
 * visible. Also derives a smoothed download speed from the byte deltas.
 */
export function useModelPull(onChanged: () => void | Promise<void>) {
  const [pulling, setPulling] = useState(false)
  const [target, setTarget] = useState('')
  const [progress, setProgress] = useState<PullProgress | null>(null)
  const [speed, setSpeed] = useState(0) // bytes / second
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const sampleRef = useRef<{ completed: number; t: number } | null>(null)

  const start = useCallback(
    async (name: string) => {
      const t = name.trim()
      if (!t || abortRef.current) return
      setPulling(true)
      setTarget(t)
      setProgress({ status: 'starting…' })
      setSpeed(0)
      setError('')
      setDone('')
      sampleRef.current = null

      const controller = new AbortController()
      abortRef.current = controller

      try {
        await pullModel({
          name: t,
          signal: controller.signal,
          onProgress: (p) => {
            setProgress(p)
            if (typeof p.completed !== 'number') return
            const now = performance.now()
            const prev = sampleRef.current
            if (!prev) {
              sampleRef.current = { completed: p.completed, t: now }
            } else if (now - prev.t >= 250) {
              if (p.completed >= prev.completed) {
                const inst = (p.completed - prev.completed) / ((now - prev.t) / 1000)
                setSpeed((s) => (s > 0 ? s * 0.6 + inst * 0.4 : inst))
              }
              sampleRef.current = { completed: p.completed, t: now }
            }
          },
        })
        setProgress(null)
        setSpeed(0)
        setDone(t)
        setTarget('')
        await onChanged()
      } catch (e) {
        setProgress(null)
        setSpeed(0)
        if (!(e instanceof Error && e.name === 'AbortError')) {
          setError(e instanceof Error ? e.message : 'Pull failed')
        }
      } finally {
        setPulling(false)
        abortRef.current = null
        sampleRef.current = null
      }
    },
    [onChanged],
  )

  const cancel = useCallback(() => abortRef.current?.abort(), [])
  const clearDone = useCallback(() => setDone(''), [])
  const clearError = useCallback(() => setError(''), [])

  return { pulling, target, progress, speed, error, done, start, cancel, clearDone, clearError }
}

export type ModelPull = ReturnType<typeof useModelPull>
