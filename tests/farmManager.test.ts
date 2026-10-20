// End-to-end test of the farm engine with a real pseudo-terminal and a fake
// `claude` CLI that sends hooks over HTTP like the real one does.

import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pty from 'node-pty'
import { FarmManager } from '../src/main/farm/FarmManager'
import type { Plot } from '../src/shared/types'

const fakeClaude = fileURLToPath(new URL('./fixtures/fake-claude.mjs', import.meta.url))
const managers: FarmManager[] = []
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(managers.splice(0).map((m) => m.dispose()))
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stardew-test-'))
  dirs.push(dir)
  return dir
}

async function createManager(dataDir: string): Promise<FarmManager> {
  const manager = await FarmManager.create({
    dataDir,
    spawn: pty.spawn,
    resolveClaude: () => ({ file: process.execPath, prefixArgs: [fakeClaude] })
  })
  managers.push(manager)
  return manager
}

async function waitFor(manager: FarmManager, id: string, check: (p: Plot) => boolean): Promise<Plot> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const plot = manager.snapshot().plots.find((p) => p.id === id)
    if (plot && check(plot)) return plot
    if (Date.now() > deadline) throw new Error(`timed out; last state: ${JSON.stringify(plot)}`)
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('FarmManager', () => {
  it('follows a session from planting to harvest', async () => {
    const manager = await createManager(tempDir())
    const cwd = tempDir()
    const planted = manager.plant({ name: 'demo plot', cwd, agent: 'claude', remoteControl: true })
    expect(planted).toMatchObject({ state: 'seeded', running: true })

    await waitFor(manager, planted.id, () => manager.readOutput(planted.id).data.includes('fake-claude'))
    const output = manager.readOutput(planted.id).data
    expect(output).toContain('--session-id')
    expect(output).toContain('--remote-control')

    manager.write(planted.id, 'perm\r')
    await waitFor(manager, planted.id, (p) => p.state === 'pest' && p.note === '等待批准：Bash')

    manager.write(planted.id, 'hi\r')
    const thirsty = await waitFor(manager, planted.id, (p) => p.state === 'thirsty')
    expect(thirsty.growth).toBe(2)

    manager.write(planted.id, '/exit\r')
    await waitFor(manager, planted.id, (p) => p.state === 'ripe' && !p.running)

    manager.harvest(planted.id)
    expect(manager.snapshot().plots).toHaveLength(0)
    expect(manager.snapshot().harvested[0]).toMatchObject({ id: planted.id, name: 'demo plot' })
  })

  it('withers when the agent crashes', async () => {
    const manager = await createManager(tempDir())
    const plot = manager.plant({ name: 'crashy', cwd: tempDir(), agent: 'claude', remoteControl: false })
    await waitFor(manager, plot.id, () => manager.readOutput(plot.id).data.includes('fake-claude'))
    manager.write(plot.id, 'crash\r')
    const withered = await waitFor(manager, plot.id, (p) => p.state === 'withered')
    expect(withered.note).toContain('3')
  })

  it('puts plots to sleep on shutdown and resumes them later', async () => {
    const dataDir = tempDir()
    const first = await createManager(dataDir)
    const plot = first.plant({ name: 'sleeper', cwd: tempDir(), agent: 'claude', remoteControl: false })
    await waitFor(first, plot.id, () => first.readOutput(plot.id).data.includes('fake-claude'))
    await first.dispose()

    const second = await createManager(dataDir)
    expect(second.snapshot().plots[0]).toMatchObject({ id: plot.id, state: 'dormant', running: false })

    second.revive(plot.id)
    await waitFor(second, plot.id, () => second.readOutput(plot.id).data.includes('--resume'))
    const resumed = await waitFor(second, plot.id, (p) => p.state === 'thirsty' && p.running)
    expect(resumed.sessionId).toBe(plot.sessionId)
  })

  it('validates plant requests', async () => {
    const manager = await createManager(tempDir())
    expect(() => manager.plant({ name: '  ', cwd: tempDir(), agent: 'claude', remoteControl: false })).toThrow()
    expect(() => manager.plant({ name: 'x', cwd: path.join(tempDir(), 'missing'), agent: 'claude', remoteControl: false })).toThrow()
    expect(() => manager.plant({ name: 'x', cwd: tempDir(), agent: 'codex', remoteControl: false })).toThrow()
    expect(manager.snapshot().plots).toHaveLength(0)
  })
})
