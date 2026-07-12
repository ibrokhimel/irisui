import { deleteProviderKey, listProviderKeys, setProviderKey } from './keyClient'
import type { ProviderId } from './modelRef'

/**
 * Provider key status for the UI, named the way the settings/picker code reads
 * it. This is a thin, provider-typed view over keyClient — which is the layer
 * that actually dispatches between the Rust key store (packaged app) and the
 * `/api/keys` dev-server proxy (browser). Neither ever returns key material;
 * only `{ id, suffix }` comes back.
 */
export interface KeyStatus {
  id: ProviderId
  suffix: string
}

const asStatus = (keys: { id: string; suffix: string }[]): KeyStatus[] =>
  keys.map((k) => ({ id: k.id as ProviderId, suffix: k.suffix }))

export async function fetchKeyStatus(): Promise<KeyStatus[]> {
  try {
    return asStatus(await listProviderKeys())
  } catch {
    // A missing dev-server route or unreachable store means "no keys", not a
    // crash — the picker just shows the cloud providers as unconfigured.
    return []
  }
}

export async function putKey(id: ProviderId, key: string): Promise<KeyStatus[]> {
  return asStatus(await setProviderKey(id, key))
}

export async function removeKey(id: ProviderId): Promise<KeyStatus[]> {
  return asStatus(await deleteProviderKey(id))
}
