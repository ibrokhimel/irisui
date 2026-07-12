/**
 * Browser/desktop client for cloud-provider API keys.
 *
 * Keys are WRITE-ONLY from the webview's perspective. We can set a key under an
 * id and later delete it, but we can only ever read back `{ id, suffix }`, where
 * `suffix` is the masked last-4 of the stored key (e.g. "…sk12"). No function
 * here returns full key material, and none must ever be added: in the packaged
 * Tauri app the secrets live in Rust and never cross into JS; in `npm run dev`
 * they live in the Vite proxy plugin. Reading a key back is not a supported op.
 *
 * Both environments are handled by dispatching on isTauri(): the desktop shell
 * goes through Rust `keys_*` commands, the browser through the `/api/keys` proxy.
 */
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../http'

export interface ProviderKeyInfo {
  id: string
  suffix: string
}

const BASE = '/api/keys'

/** Unwrap a `{ keys }` / `{ ok, keys }` proxy response, throwing on non-OK. */
async function proxyKeys(res: Response): Promise<ProviderKeyInfo[]> {
  if (!res.ok) throw new Error(`Key request failed: ${res.status}`)
  const data = (await res.json()) as { keys: ProviderKeyInfo[] }
  return data.keys
}

/** List stored keys as masked `{ id, suffix }` — never full key material. */
export async function listProviderKeys(): Promise<ProviderKeyInfo[]> {
  if (isTauri()) return invoke<ProviderKeyInfo[]>('keys_list')
  return proxyKeys(await fetch(BASE))
}

/** Store `key` under `id`, returning the updated masked list. */
export async function setProviderKey(id: string, key: string): Promise<ProviderKeyInfo[]> {
  const trimmed = key.trim()
  if (!trimmed) throw new Error('Missing key') // reject before any I/O, mirroring the server's 400
  if (isTauri()) return invoke<ProviderKeyInfo[]>('keys_set', { id, key: trimmed })
  return proxyKeys(
    await fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: trimmed }),
    }),
  )
}

/** Remove the key stored under `id`, returning the updated masked list. */
export async function deleteProviderKey(id: string): Promise<ProviderKeyInfo[]> {
  if (isTauri()) return invoke<ProviderKeyInfo[]>('keys_delete', { id })
  return proxyKeys(await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' }))
}
