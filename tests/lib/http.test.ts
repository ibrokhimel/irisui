import { afterEach, describe, expect, it, vi } from 'vitest'

// Simulates Tauri's Channel: the Rust side pushes events at `onmessage`.
class FakeChannel<T> {
  onmessage: ((e: T) => void) | null = null
}

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  Channel: FakeChannel,
}))

const { appFetch, isTauri, providerFetch } = await import('../../src/lib/http')

const enc = (s: string) => Array.from(new TextEncoder().encode(s))

/** Drives the fake Rust side: emit head, then chunks, then end. */
function respondWith(status: number, chunks: string[]) {
  invoke.mockImplementation(async (cmd: string, args: any) => {
    if (cmd !== 'http_fetch') return
    const ch = args.onEvent as FakeChannel<any>
    ch.onmessage?.({ type: 'head', status, headers: [['content-type', 'application/json']] })
    for (const c of chunks) ch.onmessage?.({ type: 'chunk', bytes: enc(c) })
    ch.onmessage?.({ type: 'end' })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  invoke.mockReset()
})

describe('appFetch outside Tauri', () => {
  it('falls back to the platform fetch', async () => {
    const globalFetch = vi.fn().mockResolvedValue(new Response('web'))
    vi.stubGlobal('fetch', globalFetch)
    expect(isTauri()).toBe(false)
    await appFetch('http://localhost:11434/api/tags')
    expect(globalFetch).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('providerFetch', () => {
  it('in Tauri, tells Rust which provider to inject a key for — the key never enters JS', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    respondWith(200, ['{"ok":true}'])

    await providerFetch('openai', 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: '{}',
    })

    const [cmd, args] = invoke.mock.calls[0]
    expect(cmd).toBe('http_fetch')
    expect(args.req.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(args.req.authProvider).toBe('openai')
    // The request the webview hands to Rust carries no Authorization header —
    // Rust attaches it. Prove the key path is not in JS at all.
    const headerNames = args.req.headers.map(([k]: [string]) => k.toLowerCase())
    expect(headerNames).not.toContain('authorization')
  })

  it('in the browser, rewrites the provider URL onto its same-origin proxy path', async () => {
    const globalFetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', globalFetch)
    expect(isTauri()).toBe(false)

    await providerFetch('anthropic', 'https://api.anthropic.com/v1/messages', { method: 'POST' })

    expect(globalFetch).toHaveBeenCalledOnce()
    expect(globalFetch.mock.calls[0][0]).toBe('/anthropic/v1/messages')
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('appFetch inside Tauri', () => {
  it('streams the body through the Rust http_fetch command', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    respondWith(200, ['{"models":', '[]}'])

    const res = await appFetch('http://localhost:11434/api/tags')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ models: [] })

    const [cmd, args] = invoke.mock.calls[0]
    expect(cmd).toBe('http_fetch')
    expect(args.req.url).toBe('http://localhost:11434/api/tags')
    expect(args.req.method).toBe('GET')
    // appFetch never sets authProvider — only providerFetch does.
    expect(args.req.authProvider).toBeNull()
  })

  it('sends NO Origin header — Ollama 403s any origin outside its allowlist', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    respondWith(200, ['{}'])

    await appFetch('http://localhost:11434/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    })

    const names = invoke.mock.calls[0][1].req.headers.map(([k]: [string]) => k.toLowerCase())
    expect(names).not.toContain('origin')
    expect(names).toContain('content-type')
  })

  it('forwards the request body as bytes', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    respondWith(200, ['{}'])

    await appFetch('http://localhost:11434/api/chat', { method: 'POST', body: '{"x":1}' })

    const { body } = invoke.mock.calls[0][1].req
    expect(new TextDecoder().decode(new Uint8Array(body))).toBe('{"x":1}')
  })

  it('surfaces a non-OK status rather than throwing', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    respondWith(403, [])

    const res = await appFetch('http://localhost:11434/api/tags')
    expect(res.ok).toBe(false)
    expect(res.status).toBe(403)
  })

  it('rejects when the Rust side reports a transport error', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    invoke.mockImplementation(async (cmd: string, args: any) => {
      if (cmd !== 'http_fetch') return
      args.onEvent.onmessage?.({ type: 'error', message: 'connection refused' })
    })

    await expect(appFetch('http://localhost:11434/api/tags')).rejects.toThrow(/connection refused/)
  })

  it('aborts an in-flight request and cancels it on the Rust side', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    const ac = new AbortController()
    invoke.mockImplementation(async (cmd: string, args: any) => {
      if (cmd !== 'http_fetch') return
      args.onEvent.onmessage?.({ type: 'head', status: 200, headers: [] })
      // Body never completes; the abort below must tear it down.
    })

    const res = await appFetch('http://localhost:11434/api/chat', { signal: ac.signal })
    const read = res.body!.getReader().read()
    ac.abort()

    await expect(read).rejects.toThrow()
    expect(invoke.mock.calls.some(([c]) => c === 'http_cancel')).toBe(true)
  })
})
