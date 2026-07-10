#!/usr/bin/env node
/**
 * IrisUI dev launcher.
 *
 * Brings up Ollama (if needed) and then the Vite dev server, so `npm run
 * dev:ollama` is a single command that "just works". The browser can't launch
 * local processes, so this script bridges that gap for development.
 *
 *   - Ollama already running      -> start Vite
 *   - Ollama installed, not running -> `ollama serve` in background, wait, Vite
 *   - Ollama not on PATH          -> warn, start Vite anyway (UI shows offline)
 *
 * Ctrl+C stops Vite and, if we started Ollama, that child too.
 */
import { spawn } from 'node:child_process'
import process from 'node:process'

const OLLAMA_URL = 'http://localhost:11434/api/tags'
const isWindows = process.platform === 'win32'
const npmCmd = isWindows ? 'npm.cmd' : 'npm'

let ollamaProc = null
let viteProc = null
let shuttingDown = false

async function isOllamaRunning() {
  try {
    const res = await fetch(OLLAMA_URL)
    return res.ok
  } catch {
    return false
  }
}

function hasOllamaCli() {
  return new Promise((resolve) => {
    const probe = spawn(isWindows ? 'where' : 'which', ['ollama'], {
      stdio: 'ignore',
      shell: isWindows,
    })
    probe.on('error', () => resolve(false))
    probe.on('close', (code) => resolve(code === 0))
  })
}

function startOllamaServe() {
  console.log('Starting ollama serve...')
  ollamaProc = spawn('ollama', ['serve'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows,
  })
  ollamaProc.stdout?.on('data', (d) => process.stdout.write(`  [ollama] ${d}`))
  ollamaProc.stderr?.on('data', (d) => process.stderr.write(`  [ollama] ${d}`))
  ollamaProc.on('error', (err) => {
    console.warn(`Could not start ollama serve: ${err.message}`)
  })
}

async function waitForOllama(timeoutMs = 30000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isOllamaRunning()) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

function startVite() {
  console.log('Starting IrisUI dev server...')
  viteProc = spawn(npmCmd, ['run', 'dev'], { stdio: 'inherit', shell: isWindows })
  viteProc.on('close', (code) => {
    if (!shuttingDown) {
      cleanup()
      process.exit(code ?? 0)
    }
  })
}

function cleanup() {
  if (shuttingDown) return
  shuttingDown = true
  if (viteProc && !viteProc.killed) {
    try {
      viteProc.kill()
    } catch {
      /* ignore */
    }
  }
  if (ollamaProc && !ollamaProc.killed) {
    try {
      ollamaProc.kill()
    } catch {
      /* ignore */
    }
  }
}

process.on('SIGINT', () => {
  console.log('\nShutting down IrisUI...')
  cleanup()
  process.exit(0)
})
process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})

async function main() {
  console.log('Checking Ollama...')

  if (await isOllamaRunning()) {
    console.log('Ollama already running.')
    startVite()
    return
  }

  if (!(await hasOllamaCli())) {
    console.log('Ollama CLI not found on PATH.')
    console.log('Starting IrisUI dev server anyway. The app will show Ollama offline.')
    startVite()
    return
  }

  console.log('Ollama not running.')
  startOllamaServe()

  if (await waitForOllama()) {
    console.log('Ollama ready at http://localhost:11434')
  } else {
    console.warn('Ollama did not become ready in time — starting IrisUI anyway.')
  }
  startVite()
}

main().catch((err) => {
  console.error(err)
  cleanup()
  process.exit(1)
})
