import { afterEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import { startHookServer, type HookServer } from './hookServer'

let server: HookServer | null = null
afterEach(async () => {
  await server?.close()
  server = null
})

function post(url: string, headers: Record<string, string>, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode ?? 0))
    })
    req.on('error', reject)
    req.end(body)
  })
}

describe('hook server', () => {
  it('accepts authenticated hooks and passes them on', async () => {
    const received: Array<[string, string]> = []
    server = await startHookServer((plotId, name) => received.push([plotId, name]))
    const status = await post(server.url, { Authorization: `Bearer ${server.token}`, 'X-Stardew-Plot': 'plot-1' }, JSON.stringify({ hook_event_name: 'Stop' }))
    expect(status).toBe(200)
    expect(received).toEqual([['plot-1', 'Stop']])
  })

  it('rejects missing tokens, wrong hosts and bad plot ids', async () => {
    const received: string[] = []
    server = await startHookServer((_, name) => received.push(name))
    const body = JSON.stringify({ hook_event_name: 'Stop' })
    expect(await post(server.url, { 'X-Stardew-Plot': 'p' }, body)).toBe(401)
    expect(await post(server.url, { Authorization: 'Bearer nope', 'X-Stardew-Plot': 'p' }, body)).toBe(401)
    expect(await post(server.url, { Authorization: `Bearer ${server.token}`, 'X-Stardew-Plot': '../x' }, body)).toBe(400)
    expect(await post(server.url, { Authorization: `Bearer ${server.token}`, 'X-Stardew-Plot': 'p', Host: 'evil.example:80' }, body)).toBe(403)
    expect(received).toEqual([])
  })

  it('answers malformed bodies without crashing', async () => {
    server = await startHookServer(() => {
      throw new Error('should not be called')
    })
    expect(await post(server.url, { Authorization: `Bearer ${server.token}`, 'X-Stardew-Plot': 'p' }, 'not json')).toBe(200)
  })
})
