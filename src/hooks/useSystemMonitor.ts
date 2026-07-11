import { useCallback, useEffect, useState } from 'react'
import type { RunningModel } from '../lib/ollama'
import { getOllamaVersion, isAbortError, listRunningModels } from '../lib/ollama'
import type { SystemSnapshot } from '../lib/system'
import { fetchSystemStats, pushSample } from '../lib/system'

export interface SystemMonitorData {
  system: SystemSnapshot | null
  systemAvailable: boolean
  running: RunningModel[]
  ollamaUp: boolean
  ollamaVersion: string
  gpuHistory: number[]
  cpuHistory: number[]
  lastUpdated: number | null
  refresh: () => void
}

const SYSTEM_POLL_MS = 2_000
const SYSTEM_RETRY_MS = 30_000 // slow retry once the endpoint has proven absent
const PS_POLL_MS = 5_000

/**
 * Polls /api/system (2 s) and Ollama /api/ps (5 s) while the tab is visible.
 * The panel unmounts when collapsed, so mount = polling on. A failing
 * /api/system flips systemAvailable and backs off to a 30 s retry; a failing
 * /api/ps marks Ollama offline. isStreaming is a poll-now signal so the
 * loaded-models list reacts to generations starting/finishing.
 */
export function useSystemMonitor({ isStreaming }: { isStreaming: boolean }): SystemMonitorData {
  const [system, setSystem] = useState<SystemSnapshot | null>(null)
  const [systemAvailable, setSystemAvailable] = useState(true)
  const [running, setRunning] = useState<RunningModel[]>([])
  const [ollamaUp, setOllamaUp] = useState(false)
  const [ollamaVersion, setOllamaVersion] = useState('')
  const [gpuHistory, setGpuHistory] = useState<number[]>([])
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // /api/system loop
  useEffect(() => {
    if (!visible) return
    const ctrl = new AbortController()
    let stopped = false
    let busy = false
    const poll = async () => {
      if (busy) return
      busy = true
      try {
        const snap = await fetchSystemStats(ctrl.signal)
        if (stopped) return
        setSystem(snap)
        setSystemAvailable(true)
        if (snap.gpu) setGpuHistory((h) => pushSample(h, snap.gpu!.utilPct))
        setCpuHistory((h) => pushSample(h, snap.cpu.utilPct))
        setLastUpdated(Date.now())
      } catch (err) {
        if (stopped || isAbortError(err)) return
        setSystem(null)
        setSystemAvailable(false)
      } finally {
        busy = false
      }
    }
    void poll()
    const id = window.setInterval(() => void poll(), systemAvailable ? SYSTEM_POLL_MS : SYSTEM_RETRY_MS)
    return () => {
      stopped = true
      ctrl.abort()
      window.clearInterval(id)
    }
  }, [visible, systemAvailable, tick])

  // Ollama /api/ps loop — isStreaming in deps forces an immediate poll on
  // generation start/finish (model may have just loaded or switched).
  useEffect(() => {
    if (!visible) return
    const ctrl = new AbortController()
    let stopped = false
    let busy = false
    const poll = async () => {
      if (busy) return
      busy = true
      try {
        const models = await listRunningModels(ctrl.signal)
        if (stopped) return
        setRunning(models)
        setOllamaUp(true)
        setLastUpdated(Date.now())
      } catch (err) {
        if (stopped || isAbortError(err)) return
        setRunning([])
        setOllamaUp(false)
      } finally {
        busy = false
      }
    }
    void poll()
    const id = window.setInterval(() => void poll(), PS_POLL_MS)
    return () => {
      stopped = true
      ctrl.abort()
      window.clearInterval(id)
    }
  }, [visible, isStreaming, tick])

  // Version once per offline→online transition.
  useEffect(() => {
    if (!ollamaUp) return
    let cancelled = false
    const ctrl = new AbortController()
    getOllamaVersion(ctrl.signal)
      .then((v) => { if (!cancelled) setOllamaVersion(v) })
      .catch(() => { /* aborted or unreachable — version is cosmetic, stay silent */ })
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [ollamaUp])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  return {
    system, systemAvailable, running, ollamaUp, ollamaVersion,
    gpuHistory, cpuHistory, lastUpdated, refresh,
  }
}
