import { useCallback, useEffect, useState } from 'react'
import type { Persona, PromptItem } from '../lib/studioStore'
import { listPersonas, listPrompts } from '../lib/studioStore'

/**
 * Owns the personas + prompt library lists at the app root so the Studio page
 * and the chat composer (persona chip) share one source of truth. `reload` is
 * called after any mutation (create / update / delete) to refresh both.
 */
export function useStudio() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [prompts, setPrompts] = useState<PromptItem[]>([])

  const reload = useCallback(async () => {
    try {
      const [p, pr] = await Promise.all([listPersonas(), listPrompts()])
      setPersonas(p)
      setPrompts(pr)
    } catch {
      /* best-effort — empty lists are a safe fallback */
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { personas, prompts, reload }
}
