import { afterEach, describe, expect, it, vi } from 'vitest'
import { getOllamaVersion, listRunningModels } from '../../src/lib/ollama'

afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

describe('listRunningModels', () => {
  it('parses name, size, size_vram and expires_at', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      models: [{
        name: 'qwen2.5:7b', size: 8_000_000_000, size_vram: 7_600_000_000,
        expires_at: '2026-07-11T12:11:00Z', digest: 'abc',
      }],
    })))
    const models = await listRunningModels()
    expect(models).toEqual([{
      name: 'qwen2.5:7b', size: 8_000_000_000, size_vram: 7_600_000_000,
      expires_at: '2026-07-11T12:11:00Z',
    }])
  })

  it('defaults missing numeric fields to 0 and drops nameless entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      models: [{ name: 'a' }, { size: 5 }],
    })))
    expect(await listRunningModels()).toEqual([{ name: 'a', size: 0, size_vram: 0, expires_at: undefined }])
  })

  it('returns [] when models is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({})))
    expect(await listRunningModels()).toEqual([])
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 500)))
    await expect(listRunningModels()).rejects.toThrow('500')
  })

  it('drops null/non-object entries in models but keeps valid ones', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      models: [null, 'not-an-object', { name: 'ok', size: 1, size_vram: 1 }],
    })))
    expect(await listRunningModels()).toEqual([
      { name: 'ok', size: 1, size_vram: 1, expires_at: undefined },
    ])
  })
})

describe('getOllamaVersion', () => {
  it('returns the version string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ version: '0.2.7' })))
    expect(await getOllamaVersion()).toBe('0.2.7')
  })

  it('returns empty string when the field is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({})))
    expect(await getOllamaVersion()).toBe('')
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 503)))
    await expect(getOllamaVersion()).rejects.toThrow('503')
  })

  it('returns empty string when the body is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(null)))
    expect(await getOllamaVersion()).toBe('')
  })
})
