import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { systemStatsPlugin } from './scripts/systemStatsPlugin'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

// IrisUI dev server.
//
// The browser talks to Ollama through the `/ollama` proxy below rather than
// hitting http://localhost:11434 directly. Same-origin requests can never trip
// CORS, so the app works regardless of how the user's Ollama is configured.
// See src/lib/ollama.ts for how the base URL is chosen.
export default defineConfig({
  plugins: [react(), tailwindcss(), systemStatsPlugin()],
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
      // Live model discovery from the Hugging Face API (same-origin via proxy).
      '/hf': {
        target: 'https://huggingface.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hf/, ''),
      },
    },
  },
})
