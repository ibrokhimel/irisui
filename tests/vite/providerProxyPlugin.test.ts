import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'

const listKeysMock = vi.fn()
const writeKeyMock = vi.fn()
const deleteKeyMock = vi.fn()
const readKeysMock = vi.fn()

// Mock keyStore's disk-touching functions so tests never read/write the real
// `.keys.local.json` in the project root, while keeping the real isLoopbackHost
// so the host-derivation logic under test is exercised for real.
vi.mock('../../vite/keyStore', async () => {
  const actual = await vi.importActual<typeof import('../../vite/keyStore')>('../../vite/keyStore')
  return {
    ...actual,
    listKeys: (...args: unknown[]) => listKeysMock(...args),
    writeKey: (...args: unknown[]) => writeKeyMock(...args),
    deleteKey: (...args: unknown[]) => deleteKeyMock(...args),
    readKeys: (...args: unknown[]) => readKeysMock(...args),
  }
})

const { providerProxyPlugin, injectAuthHeaders } = await import('../../vite/providerProxyPlugin')

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown

/** Builds a minimal fake ViteDevServer and captures the '/api/keys' middleware it registers. */
function setUpServer(host: string | boolean | undefined): {
  handler: Handler
  warnings: string[]
} {
  const warnings: string[] = []
  let handler: Handler | undefined

  const server = {
    config: {
      server: { host },
      logger: { warn: (msg: string) => warnings.push(msg) },
    },
    middlewares: {
      use: (_path: string, h: Handler) => {
        handler = h
      },
    },
  } as unknown as ViteDevServer

  providerProxyPlugin().configureServer?.(server)
  if (!handler) throw new Error('middleware was not registered')
  return { handler, warnings }
}

/** A fake IncomingMessage: an async-iterable (for readBody) with method/url attached. */
function makeReq(method: string, url: string, body?: string): IncomingMessage {
  async function* chunks() {
    if (body) yield Buffer.from(body)
  }
  const req = chunks() as unknown as IncomingMessage & AsyncGenerator<Buffer>
  Object.assign(req, { method, url })
  return req
}

function makeRes(): { res: ServerResponse; status: () => number; body: () => unknown } {
  let statusCode = 0
  let raw = ''
  const res = {
    setHeader: () => {},
    end: (chunk?: string) => {
      raw = chunk ?? ''
    },
  } as unknown as ServerResponse
  Object.defineProperty(res, 'statusCode', {
    get: () => statusCode,
    set: (v: number) => {
      statusCode = v
    },
  })
  return { res, status: () => statusCode, body: () => (raw ? JSON.parse(raw) : undefined) }
}

beforeEach(() => {
  listKeysMock.mockReset().mockReturnValue([])
  writeKeyMock.mockReset()
  deleteKeyMock.mockReset()
  readKeysMock.mockReset()
})

describe('loopback derivation from server.config.server.host', () => {
  it('treats host: true (bind all interfaces) as NOT loopback', async () => {
    const { handler, warnings } = setUpServer(true)
    const { res, status, body } = makeRes()
    await handler(makeReq('GET', '/'), res)
    expect(status()).toBe(403)
    expect(body()).toMatchObject({ error: expect.stringContaining('Refusing to serve API keys') })
    expect(warnings.some((w) => w.includes('non-loopback'))).toBe(true)
    expect(listKeysMock).not.toHaveBeenCalled()
  })

  it('treats host: undefined (vite default) as loopback', async () => {
    const { handler, warnings } = setUpServer(undefined)
    const { res, status } = makeRes()
    await handler(makeReq('GET', '/'), res)
    expect(status()).toBe(200)
    expect(warnings).toEqual([])
  })

  it('treats an explicit loopback string host as loopback', async () => {
    const { handler } = setUpServer('localhost')
    const { res, status } = makeRes()
    await handler(makeReq('GET', '/'), res)
    expect(status()).toBe(200)
  })

  it('treats a LAN-exposed string host as NOT loopback', async () => {
    const { handler } = setUpServer('0.0.0.0')
    const { res, status, body } = makeRes()
    await handler(makeReq('GET', '/'), res)
    expect(status()).toBe(403)
    expect(body()).toMatchObject({ error: expect.stringContaining('Refusing to serve API keys') })
  })
})

describe('route method handling (loopback)', () => {
  it('GET returns the id/suffix list from listKeys and nothing else', async () => {
    listKeysMock.mockReturnValue([{ id: 'openai', suffix: '…1234' }])
    const { handler } = setUpServer(undefined)
    const { res, status, body } = makeRes()
    await handler(makeReq('GET', '/'), res)
    expect(status()).toBe(200)
    expect(body()).toEqual({ keys: [{ id: 'openai', suffix: '…1234' }] })
  })

  it('POST with a key writes it and echoes only the refreshed list', async () => {
    listKeysMock.mockReturnValue([{ id: 'openai', suffix: '…1234' }])
    const { handler } = setUpServer(undefined)
    const { res, status, body } = makeRes()
    await handler(makeReq('POST', '/openai', JSON.stringify({ key: 'sk-test-1234' })), res)
    expect(status()).toBe(200)
    expect(writeKeyMock).toHaveBeenCalledWith('.keys.local.json', 'openai', 'sk-test-1234')
    expect(body()).toEqual({ ok: true, keys: [{ id: 'openai', suffix: '…1234' }] })
    expect(JSON.stringify(body())).not.toContain('sk-test-1234')
  })

  it('POST without a key body returns 400 and does not call writeKey', async () => {
    const { handler } = setUpServer(undefined)
    const { res, status, body } = makeRes()
    await handler(makeReq('POST', '/openai', JSON.stringify({})), res)
    expect(status()).toBe(400)
    expect(body()).toEqual({ error: 'Missing key' })
    expect(writeKeyMock).not.toHaveBeenCalled()
  })

  it('DELETE removes the key and echoes the refreshed list', async () => {
    listKeysMock.mockReturnValue([])
    const { handler } = setUpServer(undefined)
    const { res, status, body } = makeRes()
    await handler(makeReq('DELETE', '/openai'), res)
    expect(status()).toBe(200)
    expect(deleteKeyMock).toHaveBeenCalledWith('.keys.local.json', 'openai')
    expect(body()).toEqual({ ok: true, keys: [] })
  })

  it('an unsupported method returns 405', async () => {
    const { handler } = setUpServer(undefined)
    const { res, status, body } = makeRes()
    await handler(makeReq('PUT', '/openai'), res)
    expect(status()).toBe(405)
    expect(body()).toEqual({ error: 'Method not allowed' })
  })
})

describe('injectAuthHeaders (outbound proxy auth injection)', () => {
  it('attaches a Bearer token for openai', () => {
    readKeysMock.mockReturnValue({ openai: 'sk-real-secret' })
    const headers: Record<string, string> = {}
    injectAuthHeaders('openai')({
      setHeader: (k: string, v: string) => {
        headers[k] = v
      },
    })
    expect(readKeysMock).toHaveBeenCalledWith('.keys.local.json')
    expect(headers).toEqual({ Authorization: 'Bearer sk-real-secret' })
  })

  it('attaches x-api-key and anthropic-version for anthropic', () => {
    readKeysMock.mockReturnValue({ anthropic: 'sk-ant-real-secret' })
    const headers: Record<string, string> = {}
    injectAuthHeaders('anthropic')({
      setHeader: (k: string, v: string) => {
        headers[k] = v
      },
    })
    expect(headers).toEqual({ 'x-api-key': 'sk-ant-real-secret', 'anthropic-version': '2023-06-01' })
  })

  it('sets no header when no key is stored for that provider', () => {
    readKeysMock.mockReturnValue({})
    const setHeader = vi.fn()
    injectAuthHeaders('openai')({ setHeader })
    expect(setHeader).not.toHaveBeenCalled()
  })

  it('sets no header for a provider id with no AUTH strategy', () => {
    readKeysMock.mockReturnValue({ ollama: 'irrelevant' })
    const setHeader = vi.fn()
    injectAuthHeaders('ollama')({ setHeader })
    expect(setHeader).not.toHaveBeenCalled()
  })
})
