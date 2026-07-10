import { MODEL_CATALOG } from './modelCatalog'

export type FitVerdict = 'comfortable' | 'tight' | 'too-large'
export interface Recommendation {
  category: string
  name: string
  label: string
  reason: string
}

export function parseApproxGb(approxSize: string): number {
  const m = approxSize.match(/([\d.]+)\s*GB/i)
  return m ? Number(m[1]) : 0
}

export function modelFit(modelBytes: number, ramGb: number): FitVerdict {
  const neededGb = (modelBytes / 1e9) * 1.2
  if (neededGb <= ramGb * 0.6) return 'comfortable'
  if (neededGb <= ramGb * 0.9) return 'tight'
  return 'too-large'
}

/** Picks per category, largest catalog model that still fits comfortably (or tight for "Best overall" at low RAM). */
const CATEGORY_POOLS: { category: string; reason: string; pool: string[] }[] = [
  {
    category: 'Best overall',
    reason: 'Strong general quality for this RAM tier',
    pool: ['qwen2.5:32b', 'qwen2.5:14b', 'llama3.1:8b', 'llama3.2:3b', 'llama3.2:1b'],
  },
  {
    category: 'Fastest',
    reason: 'Small and quick on modest hardware',
    pool: ['llama3.2:3b', 'qwen2.5:1.5b', 'llama3.2:1b', 'qwen2.5:0.5b'],
  },
  {
    category: 'Coding',
    reason: 'Tuned for code generation and review',
    pool: ['deepseek-coder-v2:16b', 'qwen2.5-coder:7b', 'qwen2.5-coder:1.5b'],
  },
  {
    category: 'Reasoning',
    reason: 'Distilled reasoning models',
    pool: ['qwq:32b', 'deepseek-r1:14b', 'deepseek-r1:7b', 'deepseek-r1:1.5b'],
  },
  {
    category: 'Low RAM',
    reason: 'Runs on the tightest machines',
    pool: ['gemma3:1b', 'qwen2.5:0.5b', 'tinyllama'],
  },
]

export function recommendModels(ramGb: number): Recommendation[] {
  const recs: Recommendation[] = []
  for (const { category, reason, pool } of CATEGORY_POOLS) {
    for (const name of pool) {
      const entry = MODEL_CATALOG.find((m) => m.name === name)
      if (!entry) continue
      const fit = modelFit(parseApproxGb(entry.approxSize) * 1e9, ramGb)
      if (fit === 'comfortable' || (fit === 'tight' && category === 'Best overall')) {
        recs.push({ category, name, label: entry.label, reason })
        break
      }
    }
  }
  return recs
}
