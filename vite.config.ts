import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { injectAuthHeaders, providerProxyPlugin } from './vite/providerProxyPlugin'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

// Every provider is reached through a proxy, so all requests are same-origin and
// CORS never applies — we do not depend on any provider's browser-origin policy.
// API keys are attached here, in Node (see vite/providerProxyPlugin.ts); they are
// never sent to the browser.
export default defineConfig({
  plugins: [react(), tailwindcss(), providerProxyPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      '/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, ''),
      },
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
      '/hf': {
        target: 'https://huggingface.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hf/, ''),
      },
    },
  },
})
