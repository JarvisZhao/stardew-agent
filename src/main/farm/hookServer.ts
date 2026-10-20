// Local endpoint for Claude Code HTTP hooks. Only reachable from this machine,
// only with the per-run token, and it never makes decisions for Claude: it
// answers `{}` immediately so the session continues exactly as it would without us.

import http from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { PLOT_HEADER } from './claude'

export type HookListener = (plotId: string, eventName: string, payload: Record<string, unknown>) => void

export interface HookServer {
  /** Full URL Claude Code should POST hooks to. */
  url: string
  token: string
  close(): Promise<void>
}

const MAX_BODY = 1024 * 1024
const PLOT_ID = /^[A-Za-z0-9-]{1,64}$/

export async function startHookServer(onHook: HookListener): Promise<HookServer> {
  const token = randomBytes(24).toString('hex')
  const expectedAuth = Buffer.from(`Bearer ${token}`)
  let port = 0

  const server = http.createServer((req, res) => {
    const reject = (status: number): void => {
      res.writeHead(status).end()
      req.resume()
    }

    if (req.method !== 'POST' || req.url !== '/hook') return reject(404)
    // DNS-rebinding guard: a browser page tricked into talking to us would send its own Host.
    if (req.headers.host !== `127.0.0.1:${port}`) return reject(403)
    const auth = Buffer.from(req.headers.authorization ?? '')
    if (auth.length !== expectedAuth.length || !timingSafeEqual(auth, expectedAuth)) return reject(401)
    const plotId = req.headers[PLOT_HEADER]
    if (typeof plotId !== 'string' || !PLOT_ID.test(plotId)) return reject(400)

    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        res.writeHead(413).end()
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (res.writableEnded) return
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}')
      try {
        const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return
        const record = payload as Record<string, unknown>
        const eventName = record.hook_event_name
        if (typeof eventName === 'string') onHook(plotId, eventName, record)
      } catch {
        // Malformed hook bodies are ignored; Claude Code already got its answer.
      }
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  port = (server.address() as AddressInfo).port

  return {
    url: `http://127.0.0.1:${port}/hook`,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}
