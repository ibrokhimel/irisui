import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deleteKey, isLoopbackHost, listKeys, maskKey, readKeys, writeKey } from '../../vite/keyStore'

const dir = mkdtempSync(join(tmpdir(), 'irisui-keys-'))
const file = join(dir, 'keys.json')
afterEach(() => {
  if (existsSync(file)) rmSync(file)
})

describe('maskKey', () => {
  it('reveals only the last four characters', () => {
    expect(maskKey('sk-proj-abcdefghij1234')).toBe('…1234')
  })
  it('does not leak a short key by revealing all of it', () => {
    expect(maskKey('abc')).toBe('…')
  })
})

describe('listKeys', () => {
  it('NEVER returns key material — only the id and a masked suffix', () => {
    writeKey(file, 'openai', 'sk-proj-supersecret9999')
    const listed = listKeys(file)
    expect(listed).toEqual([{ id: 'openai', suffix: '…9999' }])
    // The security property, asserted directly: the secret cannot appear anywhere
    // in what we hand back to the browser.
    expect(JSON.stringify(listed)).not.toContain('supersecret')
    expect(JSON.stringify(listed)).not.toContain('sk-proj')
  })
})

describe('readKeys / writeKey / deleteKey', () => {
  it('round-trips a key', () => {
    writeKey(file, 'openai', 'sk-1')
    expect(readKeys(file).openai).toBe('sk-1')
  })
  it('keeps providers independent', () => {
    writeKey(file, 'openai', 'sk-1')
    writeKey(file, 'anthropic', 'sk-2')
    deleteKey(file, 'openai')
    expect(readKeys(file).openai).toBeUndefined()
    expect(readKeys(file).anthropic).toBe('sk-2')
  })
  it('returns empty when the file does not exist', () => {
    expect(readKeys(join(dir, 'nope.json'))).toEqual({})
  })
  it('returns empty rather than throwing on a corrupt file', () => {
    writeKey(file, 'openai', 'sk-1')
    require('node:fs').writeFileSync(file, '{ not json')
    expect(readKeys(file)).toEqual({})
  })
})

describe('isLoopbackHost', () => {
  it('accepts loopback binds', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost(undefined)).toBe(true) // vite's default bind is loopback
  })
  it('rejects a LAN-exposed bind, because that would expose the user\'s API keys', () => {
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
    expect(isLoopbackHost('192.168.1.20')).toBe(false)
    expect(isLoopbackHost('::')).toBe(false)
  })
})
