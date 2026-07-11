import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

// IrisUI dev server.
//
// No HTTP proxies: Ollama and Hugging Face are reached directly through
// appFetch (src/lib/http.ts), which routes requests via Rust inside the Tauri
// shell, where there is no browser origin and CORS never applies. Hardware
// stats likewise come from the `system_stats` Tauri command, not a dev-server
// middleware — a release build serves static files with nothing behind them.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
