// End-to-end test of the farm engine with a real pseudo-terminal and a fake
// `claude` CLI that sends hooks over HTTP like the real one does.

import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pty from 'node-pty'
import { FarmManager } from '../src/main/farm/FarmManager'
import type { ChatItem } from '../src/shared/chat'
import type { Plot } from '../src/shared/types'

const fakeClaude = fileURLToPath(new URL('./fixtures/fake-claude.mjs', import.meta.url))
const managers: FarmManager[] = []
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(managers.splice(0).map((m) => m.dispose()))
  for (const dir of dirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 })
    } catch (error) {
      // On Windows an exiting process can keep its working folder busy a while
      // longer; a leftover temp folder is not worth failing the run for.
      if ((error as NodeJS.ErrnoException).code !== 'EBUSY') throw error
    }
  }
}, 30_000)

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stardew-test-'))
  dirs.push(dir)
  return dir
}

async function createManager(dataDir: string, env: Record<string, string> = {}): Promise<FarmManager> {
  const manager = await FarmManager.create({
    dataDir,
    spawn: pty.spawn,
    resolveClaude: () => ({ file: process.execPath, prefixArgs: [fakeClaude] }),
    env: { ...process.env, ...env }
  })
  managers.push(manager)
  return manager
}

async function waitUntil<T>(probe: () => T | undefined | false, what: string): Promise<T> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const value = probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 25))
  }
}

const plotOf = (m: FarmManager, id: string): Plot => m.snapshot().plots.find((p) => p.id === id)!
/** Screen text with wrapped lines joined back together (long temp paths wrap at 88 columns). */
const screenOf = (m: FarmManager, id: string): string => m.readScreen(id).text.replace(/\n/g, '')
const lastOf = <K extends ChatItem['kind']>(m: FarmManager, id: string, kind: K) =>
  m.readChat(id).filter((i): i is Extract<ChatItem, { kind: K }> => i.kind === kind).at(-1)

async function plantReady(manager: FarmManager, name: string): Promise<Plot> {
  const plot = manager.plant({ name, cwd: tempDir(), agent: 'claude', remoteControl: true })
  await waitUntil(() => manager.readScreen(plot.id).text.includes('fake-claude'), 'fake claude to start')
  return plot
}

describe('FarmManager', () => {
  it('chats with the session: message, streamed reply, tool card', async () => {
    const manager = await createManager(tempDir())
    const plot = await plantReady(manager, 'demo plot')
    const screen = screenOf(manager, plot.id)
    expect(screen).toContain('--session-id')
    expect(screen).toContain('--remote-control')

    await manager.sendMessage(plot.id, 'hi')
    await waitUntil(() => plotOf(manager, plot.id).state === 'thirsty' && lastOf(manager, plot.id, 'assistant'), 'reply')
    const kinds = manager.readChat(plot.id).map((i) => i.kind)
    expect(kinds).toEqual(['notice', 'user', 'tool', 'assistant'])
    expect(lastOf(manager, plot.id, 'user')).toMatchObject({ text: 'hi' })
    expect(lastOf(manager, plot.id, 'tool')).toMatchObject({ title: '读取文件', detail: 'README.md', status: 'done' })
    expect(lastOf(manager, plot.id, 'assistant')).toMatchObject({ text: 'hello from\nfake claude\n', streaming: false })
  })

  it('answers a permission request from the chat panel', async () => {
    const manager = await createManager(tempDir())
    const plot = await plantReady(manager, 'perm')
    await manager.sendMessage(plot.id, 'perm')
    const request = await waitUntil(() => {
      const item = lastOf(manager, plot.id, 'permission')
      return plotOf(manager, plot.id).state === 'pest' && item?.status === 'pending' && item
    }, 'permission request')
    expect(request).toMatchObject({ title: '运行命令', detail: 'npm test' })

    // Clicking right away is fine: it waits for the menu to be drawn.
    await manager.respondPermission(plot.id, request.id, true)
    await waitUntil(() => lastOf(manager, plot.id, 'tool')?.status === 'done', 'tool to finish')
    expect(lastOf(manager, plot.id, 'permission')?.status).toBe('allowed')
    expect(lastOf(manager, plot.id, 'tool')?.output).toBe('35 passed')
  })

  it('declines a permission request with Esc', async () => {
    const manager = await createManager(tempDir())
    const plot = await plantReady(manager, 'deny')
    await manager.sendMessage(plot.id, 'perm')
    const request = await waitUntil(() => lastOf(manager, plot.id, 'permission'), 'permission request')
    await waitUntil(() => manager.readScreen(plot.id).dialog, 'menu')
    await manager.respondPermission(plot.id, request.id, false)
    await waitUntil(() => lastOf(manager, plot.id, 'assistant')?.text === 'ok, not running it', 'reply')
    expect(lastOf(manager, plot.id, 'permission')?.status).toBe('denied')
  })

  it('answers a multiple-choice question by option label', async () => {
    const manager = await createManager(tempDir())
    const plot = await plantReady(manager, 'ask')
    await manager.sendMessage(plot.id, 'ask')
    await waitUntil(() => lastOf(manager, plot.id, 'question')?.status === 'pending', 'question')
    expect(plotOf(manager, plot.id)).toMatchObject({ state: 'thirsty', note: '有问题要问你' })

    await manager.pickOption(plot.id, 'B')
    await waitUntil(() => lastOf(manager, plot.id, 'assistant')?.text === 'you picked B', 'answer')
    expect(lastOf(manager, plot.id, 'question')?.status).toBe('answered')
    await expect(manager.pickOption(plot.id, 'B')).rejects.toThrow('没找到选项')
  })

  it('handles the trust-folder dialog without confirming its "No, exit" default', async () => {
    const manager = await createManager(tempDir(), { FAKE_TRUST: '1' })
    const plot = manager.plant({ name: 'trust', cwd: tempDir(), agent: 'claude', remoteControl: false })
    const screen = await waitUntil(() => {
      const s = manager.readScreen(plot.id)
      return s.known === 'trust' && s
    }, 'trust dialog')
    expect(screen.dialog).toBe(true)
    await manager.pickOption(plot.id, 'Yes, I trust this folder')
    await waitUntil(() => manager.readScreen(plot.id).text.includes('fake-claude'), 'session to start')
    expect(plotOf(manager, plot.id).running).toBe(true)
  })

  it('sends multi-line messages as one prompt', async () => {
    const manager = await createManager(tempDir())
    const plot = await plantReady(manager, 'multi')
    await manager.sendMessage(plot.id, 'line one\nline two')
    await waitUntil(() => lastOf(manager, plot.id, 'assistant'), 'reply')
    expect(lastOf(manager, plot.id, 'user')?.text).toBe('line one\nline two')
  })

  it('ripens on exit and withers on a crash', async () => {
    const manager = await createManager(tempDir())
    const good = await plantReady(manager, 'good')
    const bad = await plantReady(manager, 'bad')
    await manager.sendMessage(good.id, '/exit')
    await manager.sendMessage(bad.id, 'crash')
    await waitUntil(() => plotOf(manager, good.id).state === 'ripe' && plotOf(manager, bad.id).state === 'withered', 'exits')
    expect(plotOf(manager, bad.id).note).toContain('3')
    await expect(manager.sendMessage(good.id, 'hello?')).rejects.toThrow('休眠')

    manager.harvest(good.id)
    expect(manager.snapshot().plots.map((p) => p.id)).toEqual([bad.id])
    expect(manager.snapshot().harvested[0]).toMatchObject({ id: good.id, name: 'good' })
  })

  it('keeps plots and chats across restarts and resumes them', async () => {
    const dataDir = tempDir()
    const first = await createManager(dataDir)
    const plot = await plantReady(first, 'sleeper')
    await first.sendMessage(plot.id, 'hi')
    await waitUntil(() => lastOf(first, plot.id, 'assistant'), 'reply')
    await first.dispose()

    const second = await createManager(dataDir)
    expect(second.snapshot().plots[0]).toMatchObject({ id: plot.id, state: 'dormant', running: false })
    expect(second.readChat(plot.id).map((i) => i.kind)).toEqual(['notice', 'user', 'tool', 'assistant', 'notice'])

    second.revive(plot.id)
    await waitUntil(() => screenOf(second, plot.id).includes('--resume'), 'resumed process')
    expect(plotOf(second, plot.id)).toMatchObject({ state: 'thirsty', running: true, sessionId: plot.sessionId })
  })

  it('validates requests', async () => {
    const manager = await createManager(tempDir())
    expect(() => manager.plant({ name: '  ', cwd: tempDir(), agent: 'claude', remoteControl: false })).toThrow()
    expect(() => manager.plant({ name: 'x', cwd: path.join(tempDir(), 'missing'), agent: 'claude', remoteControl: false })).toThrow()
    expect(() => manager.plant({ name: 'x', cwd: tempDir(), agent: 'codex', remoteControl: false })).toThrow()
    expect(() => manager.readChat('../../etc/passwd')).toThrow()
    expect(manager.snapshot().plots).toHaveLength(0)
  })
})

describe('field slots', () => {
  it('gives new plots the lowest free slot and keeps the others in place', async () => {
    const manager = await createManager(tempDir())
    const a = await plantReady(manager, 'a')
    const b = await plantReady(manager, 'b')
    const c = await plantReady(manager, 'c')
    expect([a.slot, b.slot, c.slot]).toEqual([0, 1, 2])
    manager.harvest(b.id)
    expect(plotOf(manager, c.id).slot).toBe(2)
    const d = await plantReady(manager, 'd')
    expect(d.slot).toBe(1)
  })
})
