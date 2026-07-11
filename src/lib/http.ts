/**
 * Single fetch entry point for the app. Inside the Tauri desktop shell the
 * request is issued from the Rust side via the HTTP plugin — there is no
 * browser origin, so CORS never applies: Ollama needs no OLLAMA_ORIGINS
 * config, and the webview origin (http://tauri.localhost) never has to be
 * allowlisted. Outside Tauri (vitest, a stray browser tab) it falls back to
 * the platform fetch, which is exactly what the existing tests stub.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function appFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (isTauri()) {
    // Imported lazily so non-Tauri environments never load the plugin.
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    return tauriFetch(input, init)
  }
  return globalThis.fetch(input, init)
}
