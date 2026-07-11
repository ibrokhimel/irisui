import type { Plugin, ViteDevServer } from 'vite'
import { deleteKey, isLoopbackHost, listKeys, readKeys, writeKey } from './keyStore'

const KEY_FILE = '.keys.local.json'

/** Where each provider's key goes on an outbound request. */
const AUTH: Record<string, (key: string) => Record<string, string>> = {
  openai: (key) => ({ Authorization: `Bearer ${key}` }),
  anthropic: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
}

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

/**
 * Holds the user's API keys server-side and injects them into proxied requests,
 * so the browser never sees a key. The page can create and delete keys, and can
 * ask which providers have one, but there is no route that returns key material.
 */
export function providerProxyPlugin(): Plugin {
  return {
    name: 'irisui-provider-proxy',

    configureServer(server: ViteDevServer) {
      // server.host may be `true` (meaning "bind to all interfaces"), a string,
      // or undefined (vite's loopback default). Anything that is not an explicit
      // loopback string is treated as exposed.
      const host = server.config.server.host
      const loopback = typeof host === 'string' ? isLoopbackHost(host) : host !== true

      server.middlewares.use('/api/keys', async (req, res) => {
        if (!loopback) {
          return json(res, 403, {
            error:
              'Refusing to serve API keys: the dev server is bound to a non-loopback address. ' +
              'Anyone on your network could spend your money. Restart without --host.',
          })
        }

        const id = (req.url ?? '/').replace(/^\//, '').split('?')[0]

        if (req.method === 'GET') {
          // Only ids and masked suffixes. Never key material.
          return json(res, 200, { keys: listKeys(KEY_FILE) })
        }

        if (req.method === 'POST' && id) {
          const body = JSON.parse((await readBody(req)) || '{}') as { key?: unknown }
          if (typeof body.key !== 'string' || !body.key.trim()) {
            return json(res, 400, { error: 'Missing key' })
          }
          writeKey(KEY_FILE, id, body.key.trim())
          // Echo back only whether it is present — never the key.
          return json(res, 200, { ok: true, keys: listKeys(KEY_FILE) })
        }

        if (req.method === 'DELETE' && id) {
          deleteKey(KEY_FILE, id)
          return json(res, 200, { ok: true, keys: listKeys(KEY_FILE) })
        }

        return json(res, 405, { error: 'Method not allowed' })
      })

      if (!loopback) {
        server.config.logger.warn(
          '[irisui] Dev server is bound to a non-loopback address. Cloud providers are ' +
            'disabled: serving API keys over the network would let anyone spend your money.',
        )
      }
    },
  }
}

/** Header injection for the proxy config in vite.config.ts. */
export function injectAuthHeaders(providerId: string) {
  return (proxyReq: { setHeader(k: string, v: string): void }) => {
    const key = readKeys(KEY_FILE)[providerId]
    if (!key) return
    for (const [h, v] of Object.entries(AUTH[providerId]?.(key) ?? {})) {
      proxyReq.setHeader(h, v)
    }
  }
}
