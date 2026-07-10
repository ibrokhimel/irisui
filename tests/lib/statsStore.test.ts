import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addStat, clearStats, listStats } from '../../src/lib/statsStore'
import { computeStat } from '../../src/lib/stats'

const meta = { promptTokens: 1, completionTokens: 30, evalDurationNs: 1e9, totalDurationNs: 1.2e9, loadDurationNs: 0 }
const mk = (at: number) => computeStat({ conversationId: 'c', model: 'm', startedAt: at, ttftMs: 50, totalMs: 1200, meta })

describe('statsStore', () => {
  beforeEach(async () => { await clearStats() })

  it('round-trips stats newest-first with a limit', async () => {
    await addStat(mk(1)); await addStat(mk(3)); await addStat(mk(2))
    const all = await listStats()
    expect(all.map((s) => s.startedAt)).toEqual([3, 2, 1])
    expect((await listStats(2)).length).toBe(2)
  })

  it('clearStats empties the store', async () => {
    await addStat(mk(1))
    await clearStats()
    expect(await listStats()).toEqual([])
  })
})
