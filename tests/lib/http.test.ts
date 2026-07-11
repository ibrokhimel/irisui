import { afterEach, describe, expect, it, vi } from 'vitest'
import { appFetch, isTauri } from '../../src/lib/http'

const pluginFetch = vi.fn().mockResolvedValue(new Response('tauri'))
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: pluginFetch }))

afterEach(() => {
  vi.unstubAllGlobals()
  pluginFetch.mockClear()
})

describe('appFetch', () => {
  it('falls back to global fetch outside Tauri', async () => {
    const globalFetch = vi.fn().mockResolvedValue(new Response('web'))
    vi.stubGlobal('fetch', globalFetch)
    expect(isTauri()).toBe(false)
    await appFetch('http://localhost:11434/api/tags')
    expect(globalFetch).toHaveBeenCalledOnce()
    expect(pluginFetch).not.toHaveBeenCalled()
  })

  it('uses the Tauri HTTP plugin when __TAURI_INTERNALS__ is present', async () => {
    const globalFetch = vi.fn()
    vi.stubGlobal('fetch', globalFetch)
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    expect(isTauri()).toBe(true)
    await appFetch('http://localhost:11434/api/tags', { method: 'GET' })
    expect(pluginFetch).toHaveBeenCalledOnce()
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('forwards init through to the plugin unchanged', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    const init: RequestInit = { method: 'POST', body: '{"a":1}' }
    await appFetch('http://localhost:11434/api/chat', init)
    expect(pluginFetch).toHaveBeenCalledWith('http://localhost:11434/api/chat', init)
  })
})
