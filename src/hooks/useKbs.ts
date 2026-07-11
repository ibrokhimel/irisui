import { useCallback, useEffect, useState } from 'react'
import type { KnowledgeBase } from '../lib/kbStore'
import { listKbs } from '../lib/kbStore'

/**
 * Owns the knowledge-base list at the app root so both the Knowledge page and
 * the chat composer share one source of truth. `reload` is called after any
 * mutation (create / delete / file upload) to refresh counts and membership.
 */
export function useKbs() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])

  const reload = useCallback(async () => {
    try {
      setKbs(await listKbs())
    } catch {
      /* best-effort — an empty list is a safe fallback */
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { kbs, reload }
}
