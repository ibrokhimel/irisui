import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// IrisUI dev server.
//
// The browser talks to Ollama through the `/ollama` proxy below rather than
// hitting http://localhost:11434 directly. Same-origin requests can never trip
// CORS, so the app works regardless of how the user's Ollama is configured.
// See src/lib/ollama.ts for how the base URL is chosen.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, ''),
      },
    },
  },
})
