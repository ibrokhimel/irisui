/**
 * GET /api/system — true hardware stats for the System Monitor panel.
 *
 * Served as Vite middleware in dev AND preview. A static production host
 * won't have it; the client detects the 404/network error and degrades to
 * Ollama-derived data only. All collectors are best-effort: any failure
 * turns that field into null rather than a 500.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface CpuTimes { user: number; nice: number; sys: number; idle: number; irq: number }

interface GpuLike { name: string; utilPct: number; vramUsedMb: number; vramTotalMb: number; tempC: number }

/** Parse one line of `nvidia-smi --format=csv,noheader,nounits` output. */
export function parseNvidiaSmi(line: string): GpuLike | null {
  const parts = line.split(',').map((s) => s.trim())
  if (parts.length < 5) return null
  const [name, util, used, total, temp] = parts
  const nums = [util, used, total, temp].map(Number)
  if (!name || nums.some((n) => !Number.isFinite(n))) return null
  return { name, utilPct: nums[0], vramUsedMb: nums[1], vramTotalMb: nums[2], tempC: nums[3] }
}

/** Busy percentage between two os.cpus() samples (per-core time deltas). */
export function cpuUtilBetween(prev: CpuTimes[], next: CpuTimes[]): number {
  let busy = 0
  let total = 0
  for (let i = 0; i < next.length; i++) {
    const p = prev[i]
    if (!p) continue
    const n = next[i]
    const dTotal = n.user + n.nice + n.sys + n.idle + n.irq - (p.user + p.nice + p.sys + p.idle + p.irq)
    const dIdle = n.idle - p.idle
    total += dTotal
    busy += dTotal - dIdle
  }
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((busy / total) * 100)))
}

const cpuTimes = (): CpuTimes[] => os.cpus().map((c) => c.times)

function queryGpu(): Promise<GpuLike | null> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
       '--format=csv,noheader,nounits'],
      { timeout: 3000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null)
        resolve(parseNvidiaSmi(stdout.split('\n')[0] ?? ''))
      },
    )
  })
}

function modelsDir(): string {
  const custom = process.env.OLLAMA_MODELS
  if (custom && existsSync(custom)) return custom
  const dflt = join(os.homedir(), '.ollama', 'models')
  return existsSync(dflt) ? dflt : os.homedir()
}

async function queryDisk(): Promise<{ freeBytes: number; totalBytes: number } | null> {
  try {
    const s = await statfs(modelsDir())
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize }
  } catch {
    return null
  }
}

// Snapshot cache: at most one collection (and one nvidia-smi spawn) per second,
// shared across all requests. CPU % needs two samples, so the previous call's
// sample is kept between snapshots.
let lastCpuSample = cpuTimes()
let cached: { at: number; body: string } | null = null
let inflight: Promise<string> | null = null

async function collect(): Promise<string> {
  const [gpu, disk] = await Promise.all([queryGpu(), queryDisk()])
  const nextCpu = cpuTimes()
  const snapshot = {
    gpu,
    cpu: { utilPct: cpuUtilBetween(lastCpuSample, nextCpu), cores: nextCpu.length },
    ram: { usedBytes: os.totalmem() - os.freemem(), totalBytes: os.totalmem() },
    disk,
  }
  lastCpuSample = nextCpu
  return JSON.stringify(snapshot)
}

async function getSnapshot(): Promise<string> {
  if (cached && Date.now() - cached.at < 1000) return cached.body
  inflight ??= collect()
    .then((body) => {
      cached = { at: Date.now(), body }
      return body
    })
    .finally(() => { inflight = null })
  return inflight
}

function middleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (!req.url?.startsWith('/api/system')) return next()
  getSnapshot()
    .then((body) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(body)
    })
    .catch(() => {
      res.statusCode = 500
      res.end('{}')
    })
}

export function systemStatsPlugin(): Plugin {
  return {
    name: 'iris-system-stats',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}
