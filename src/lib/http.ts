/**
 * Single fetch entry point for the app.
 *
 * Inside the desktop shell the request is issued from Rust (the `http_fetch`
 * command) and its body is streamed back over a Tauri Channel. We deliberately
 * do NOT use tauri-plugin-http: it stamps the webview's Origin onto every
 * request, and on a Windows release build that origin is
 * `http://tauri.localhost`, which is not in Ollama's allowlist — Ollama answers
 * 403 with an empty body. The failure only appears in release, because
 * `tauri dev` serves from http://localhost:5173, which Ollama does allow. Going
 * through Rust ourselves means no Origin header is sent at all.
 *
 * Outside Tauri (vitest, a stray browser tab) this falls back to the platform
 * fetch, which is what the existing tests stub.
 */
import { Channel, invoke } from '@tauri-apps/api/core'

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

type HttpEvent =
  | { type: 'head'; status: number; headers: [string, string][] }
  | { type: 'chunk'; bytes: number[] }
  | { type: 'end' }
  | { type: 'error'; message: string }

/** Statuses the Fetch spec forbids a body on; Response() throws if we pass one. */
const BODYLESS = new Set([101, 103, 204, 205, 304])

let nextRequestId = 1

async function tauriFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  authProvider?: string,
): Promise<Response> {
  // Normalizing through Request gives us method/url/header/body defaulting for
  // free, and matches what a real fetch() would have sent.
  const request = new Request(input, init)
  const rawBody = await request.arrayBuffer()
  const headers: [string, string][] = [...request.headers.entries()]
  const id = nextRequestId++
  const signal = init?.signal ?? request.signal

  const channel = new Channel<HttpEvent>()

  return new Promise<Response>((resolve, reject) => {
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    let headReceived = false
    let closed = false

    const cancelOnRust = () => void invoke('http_cancel', { id }).catch(() => {})

    const abortError = () => new DOMException('The operation was aborted.', 'AbortError')

    const failStream = (err: Error) => {
      if (closed) return
      closed = true
      try {
        controller?.error(err)
      } catch {
        /* already errored */
      }
    }

    if (signal?.aborted) {
      reject(abortError())
      return
    }

    signal?.addEventListener('abort', () => {
      cancelOnRust()
      if (!headReceived) reject(abortError())
      else failStream(abortError())
    })

    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c
      },
      cancel: cancelOnRust,
    })

    channel.onmessage = (event) => {
      switch (event.type) {
        case 'head': {
          headReceived = true
          resolve(
            new Response(BODYLESS.has(event.status) ? null : body, {
              status: event.status,
              headers: new Headers(event.headers),
            }),
          )
          break
        }
        case 'chunk':
          if (!closed) controller?.enqueue(new Uint8Array(event.bytes))
          break
        case 'end':
          if (!closed) {
            closed = true
            try {
              controller?.close()
            } catch {
              /* already closed */
            }
          }
          break
        case 'error': {
          const err = new Error(event.message)
          if (!headReceived) reject(err)
          else failStream(err)
          break
        }
      }
    }

    invoke('http_fetch', {
      id,
      req: {
        method: request.method,
        url: request.url,
        headers,
        body: rawBody.byteLength > 0 ? [...new Uint8Array(rawBody)] : null,
        authProvider: authProvider ?? null,
      },
      onEvent: channel,
    }).catch((e: unknown) => {
      const err = e instanceof Error ? e : new Error(String(e))
      if (!headReceived) reject(err)
      else failStream(err)
    })
  })
}

export async function appFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (isTauri()) return tauriFetch(input, init)
  return globalThis.fetch(input, init)
}

/**
 * Base URL each cloud provider is reached at, and the same-origin proxy path the
 * browser dev server rewrites it to. Kept here, next to the transport, because
 * the two environments reach providers by different mechanisms:
 *
 *  - Desktop (Tauri): the request goes out from Rust with its real URL, and the
 *    stored key is injected there (authProvider), so the key never enters the
 *    webview.
 *  - Browser (`npm run dev`): the Vite plugin proxies `/openai` and `/anthropic`
 *    and injects the key in Node. Same security property, different layer.
 */
const PROVIDER_PROXY: Record<string, { base: string; path: string }> = {
  openai: { base: 'https://api.openai.com', path: '/openai' },
  anthropic: { base: 'https://api.anthropic.com', path: '/anthropic' },
}

/**
 * Make an authenticated request to a cloud provider without the key ever
 * touching the webview. `url` is the provider's real endpoint
 * (e.g. `https://api.openai.com/v1/chat/completions`); the key is attached
 * server-side in whichever environment we are in. Streaming, cancellation, and
 * error handling are identical to appFetch — this only changes where auth is
 * applied. Adapters call this; they never see a key.
 */
export async function providerFetch(
  providerId: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (isTauri()) return tauriFetch(url, init, providerId)

  // Browser: rewrite the provider's real URL onto its same-origin proxy path so
  // the Vite plugin can inject the key. Unknown provider → fetch as-is.
  const provider = PROVIDER_PROXY[providerId]
  if (provider && url.startsWith(provider.base)) {
    return globalThis.fetch(provider.path + url.slice(provider.base.length), init)
  }
  return globalThis.fetch(url, init)
}
