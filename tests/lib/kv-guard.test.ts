import { describe, expect, it } from 'vitest'
import {
  contextVerdict,
  estimateTokens,
  projectContextUse,
  wasTruncated,
} from '../../src/lib/contextGuard'

describe('estimateTokens', () => {
  it('over-estimates rather than under-estimates', () => {
    // Under-estimating is the dangerous direction: it lets a request through
    // that Ollama then silently truncates. Our estimate must sit above the
    // ~4-chars-per-token rule of thumb, never below it.
    const text = 'a'.repeat(400)
    expect(estimateTokens(text)).toBeGreaterThan(400 / 4)
  })

  it('is zero for empty input', () => {
    expect(estimateTokens('')).toBe(0)
  })
})

describe('projectContextUse', () => {
  it('sums the exact history, the estimated draft, and the reply reserve', () => {
    expect(
      projectContextUse({
        lastPromptTokens: 1000,
        lastCompletionTokens: 500,
        draft: '',
        reserveTokens: 100,
      }),
    ).toBe(1600)
  })

  it('counts the draft on top of the history', () => {
    const withoutDraft = projectContextUse({
      lastPromptTokens: 1000,
      lastCompletionTokens: 0,
      draft: '',
      reserveTokens: 0,
    })
    const withDraft = projectContextUse({
      lastPromptTokens: 1000,
      lastCompletionTokens: 0,
      draft: 'x'.repeat(360),
      reserveTokens: 0,
    })
    expect(withDraft).toBe(withoutDraft + 100)
  })

  it('treats a fresh chat (no prior stats) as just the draft plus reserve', () => {
    expect(projectContextUse({ draft: '', reserveTokens: 1024 })).toBe(1024)
  })

  it('defaults to the reply reserve when none is given', () => {
    expect(projectContextUse({ draft: '' })).toBe(1024)
  })
})

describe('contextVerdict', () => {
  it('is full at or above the window', () => {
    expect(contextVerdict(8192, 8192)).toBe('full')
    expect(contextVerdict(9000, 8192)).toBe('full')
  })

  it('warns from 75% of the window', () => {
    expect(contextVerdict(6144, 8192)).toBe('warn')
    expect(contextVerdict(6143, 8192)).toBe('ok')
  })

  // A spurious refusal is worse than one request slipping through, so an
  // unresolved window (the /api/show call is still in flight) never blocks.
  it('never blocks on an unresolved window', () => {
    expect(contextVerdict(999999, 0)).toBe('ok')
    expect(contextVerdict(999999, -1)).toBe('ok')
  })
})

describe('wasTruncated', () => {
  it('flags a reply whose prompt filled the window', () => {
    expect(wasTruncated(8192, 8192)).toBe(true)
    expect(wasTruncated(8191, 8192)).toBe(false)
  })

  it('is false when there is nothing to judge', () => {
    expect(wasTruncated(0, 8192)).toBe(false)
    expect(wasTruncated(5000, 0)).toBe(false)
  })
})
