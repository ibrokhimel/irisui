import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { injectAuthHeaders, providerProxyPlugin } from './vite/providerProxyPlugin'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

// IrisUI dev server.
//
// Ollama and Hugging Face need no proxy: appFetch (src/lib/http.ts) issues those
// from Rust inside the desktop shell, where there is no browser origin and CORS
// never applies. Hardware stats likewise come from the `system_stats` Tauri
// command — a release build serves static files with nothing behind them, so a
// dev-server middleware would 404 in the shipped binary.
//
// KNOWN GAP: the cloud providers below are the one thing still bound to this dev
// server. The key store and header injection run in Node (vite/providerProxyPlugin.ts)
// so key material never reaches the page — but that means OpenAI and Anthropic
// work under `npm run dev` and are unreachable from the packaged app. Closing it
// means porting the key store and proxy to Rust commands, the same move already
// made for /api/system. Until then, cloud chat is dev-only.
export default defineConfig({
  plugins: [react(), tailwindcss(), providerProxyPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Tauri compiles Rust into src-tauri/target and holds the .dll open; letting
  // Vite's watcher near it throws EBUSY and kills the dev server.
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai/, ''),
        configure: (proxy) => proxy.on('proxyReq', injectAuthHeaders('openai')),
      },
      '/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/anthropic/, ''),
        configure: (proxy) => proxy.on('proxyReq', injectAuthHeaders('anthropic')),
      },
    },
  },
})
