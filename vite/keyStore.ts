import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Server-side API key storage for the dev server.
 *
 * Keys live here and ONLY here. They are never sent to the browser: the page
 * posts a key once, and from then on it can only learn that a key exists and
 * what its last four characters are. Nothing in this module returns key material
 * to a caller except readKeys(), which exists solely so the proxy can attach an
 * Authorization header server-side.
 */

/** Last four characters only — enough to recognize a key, useless to steal. */
export function maskKey(key: string): string {
  return key.length > 4 ? `…${key.slice(-4)}` : '…'
}

/**
 * Vite's default bind is loopback. If the server is bound to anything else
 * (`vite --host`), every machine on the network could spend the user's money
 * through our authenticated proxies — so the key routes refuse to serve.
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (host === undefined) return true // vite's default bind is loopback
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

export function readKeys(file: string): Record<string, string> {
  try {
    if (!existsSync(file)) return {}
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [id, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v) out[id] = v
    }
    return out
  } catch {
    return {}
  }
}

export function writeKey(file: string, id: string, key: string): void {
  const keys = readKeys(file)
  keys[id] = key
  // mode 0600: owner read/write only.
  writeFileSync(file, JSON.stringify(keys, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

export function deleteKey(file: string, id: string): void {
  const keys = readKeys(file)
  delete keys[id]
  writeFileSync(file, JSON.stringify(keys, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

/** What the browser is allowed to know: which providers have a key, and its suffix. */
export function listKeys(file: string): { id: string; suffix: string }[] {
  return Object.entries(readKeys(file)).map(([id, key]) => ({ id, suffix: maskKey(key) }))
}
