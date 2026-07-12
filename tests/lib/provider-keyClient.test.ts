import { afterEach, describe, expect, it, vi } from 'vitest'

// vi.mock is hoisted above imports, so the invoke fake must be created with
// vi.hoisted. keyClient pulls in src/lib/http.ts, which imports both invoke and
// Channel from @tauri-apps/api/core — the factory has to provide both.
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  Channel: class {
    onmessage: ((e: unknown) => void) | null = null
  },
}))

const { listProviderKeys, setProviderKey, deleteProviderKey } = await import(
  '../../src/lib/providers/keyClient'
)

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status })

afterEach(() => {
  vi.unstubAllGlobals()
  invoke.mockReset()
})

describe('listProviderKeys', () => {
  it('resolves the array from the keys_list command inside Tauri', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    const keys = [{ id: 'openai', suffix: '…sk12' }]
    invoke.mockResolvedValue(keys)
    await expect(listProviderKeys()).resolves.toEqual(keys)
    expect(invoke).toHaveBeenCalledWith('keys_list')
  })

  it('unwraps .keys from the proxy GET in the browser', async () => {
    const keys = [{ id: 'anthropic', suffix: '…ant9' }]
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ keys }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(listProviderKeys()).resolves.toEqual(keys)
    expect(fetchMock).toHaveBeenCalledWith('/api/keys')
  })
})

describe('setProviderKey', () => {
  it('invokes keys_set with the trimmed key and returns the updated list (Tauri)', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    const updated = [{ id: 'openai', suffix: '…sk12' }]
    invoke.mockResolvedValue(updated)
    await expect(setProviderKey('openai', 'sk-abc123')).resolves.toEqual(updated)
    expect(invoke).toHaveBeenCalledWith('keys_set', { id: 'openai', key: 'sk-abc123' })
  })

  it('POSTs the key to the proxy and returns the updated list (browser)', async () => {
    const updated = [{ id: 'openai', suffix: '…sk12' }]
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, keys: updated }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(setProviderKey('openai', 'sk-abc123')).resolves.toEqual(updated)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/keys/openai')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ key: 'sk-abc123' })
  })

  it('rejects a whitespace-only key without touching fetch or invoke (browser)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(setProviderKey('openai', '   ')).rejects.toThrow('Missing key')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects an empty key without invoking the Tauri command (Tauri)', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    await expect(setProviderKey('openai', '')).rejects.toThrow('Missing key')
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('deleteProviderKey', () => {
  it('invokes keys_delete with the id (Tauri)', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    invoke.mockResolvedValue([])
    await expect(deleteProviderKey('openai')).resolves.toEqual([])
    expect(invoke).toHaveBeenCalledWith('keys_delete', { id: 'openai' })
  })

  it('hits the proxy DELETE route (browser)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, keys: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(deleteProviderKey('openai')).resolves.toEqual([])
    expect(fetchMock.mock.calls[0][0]).toBe('/api/keys/openai')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('DELETE')
  })
})

describe('non-OK browser responses', () => {
  it('throws an error including the status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(listProviderKeys()).rejects.toThrow('500')
  })
})
