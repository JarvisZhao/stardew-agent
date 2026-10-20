// The farm engine: owns the plots, their agent processes and persistence.
// Deliberately free of Electron imports so it can be tested with plain Node.

import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IPty } from 'node-pty'
import { applyEvent, isWaiting, type PlotEvent } from '../../shared/plotMachine'
import type { OutputChunk } from '../../shared/api'
import type { FarmSnapshot, HarvestRecord, PlantRequest, Plot } from '../../shared/types'
import { buildClaudeArgs, buildHookSettings, childEnv, HOOK_ENV } from './claude'
import { toSpawnSpec, type ResolvedCommand } from './command'
import { startHookServer, type HookServer } from './hookServer'
import { OutputBuffer } from './outputBuffer'
import { loadFarm, saveFarm } from './store'

export type SpawnFn = (
  file: string,
  args: string[] | string,
  options: { name: string; cols: number; rows: number; cwd: string; env: Record<string, string> }
) => IPty

export interface FarmManagerOptions {
  dataDir: string
  spawn: SpawnFn
  /** Finds the `claude` CLI each time a plot is planted, so installing it later just works. */
  resolveClaude: () => ResolvedCommand | null
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  now?: () => number
}

export interface FarmManagerEvents {
  snapshot: [FarmSnapshot]
  output: [plotId: string, data: string, start: number]
  /** A plot just started waiting on the user. */
  attention: [Plot]
}

const MAX_NAME = 60

export class FarmManager extends EventEmitter<FarmManagerEvents> {
  private plots: Plot[]
  private harvested: HarvestRecord[]
  private readonly processes = new Map<string, IPty>()
  private readonly outputs = new Map<string, OutputBuffer>()
  /** Plots whose process we are stopping on purpose; their exit makes them dormant. */
  private readonly stopping = new Set<string>()
  private saveTimer: NodeJS.Timeout | null = null
  private disposed = false

  private constructor(
    private readonly opts: Required<Omit<FarmManagerOptions, 'env'>> & { env: NodeJS.ProcessEnv },
    private readonly hooks: HookServer,
    private readonly settingsPath: string,
    initial: FarmSnapshot
  ) {
    super()
    const now = opts.now()
    // Nothing survives an app restart: plots that were alive are now asleep.
    this.plots = initial.plots.map((p) =>
      p.running || (p.state !== 'ripe' && p.state !== 'dormant' && p.state !== 'withered')
        ? { ...p, running: false, state: 'dormant', waitingSince: null, updatedAt: now }
        : p
    )
    this.harvested = initial.harvested
  }

  static async create(options: FarmManagerOptions): Promise<FarmManager> {
    const opts = {
      platform: process.platform,
      env: process.env,
      now: Date.now,
      ...options
    }
    fs.mkdirSync(opts.dataDir, { recursive: true })
    let manager: FarmManager | null = null
    const hooks = await startHookServer((plotId, name, payload) => manager?.onHook(plotId, name, payload))
    const settingsPath = path.join(opts.dataDir, 'claude-hooks.json')
    fs.writeFileSync(settingsPath, JSON.stringify(buildHookSettings(hooks.url), null, 2))
    manager = new FarmManager(opts, hooks, settingsPath, loadFarm(opts.dataDir))
    return manager
  }

  snapshot(): FarmSnapshot {
    return { plots: this.plots, harvested: this.harvested }
  }

  get runningCount(): number {
    return this.processes.size
  }

  plant(request: PlantRequest): Plot {
    const name = request.name.trim().slice(0, MAX_NAME)
    if (!name) throw new Error('请给这块地起个名字')
    if (request.agent !== 'claude') throw new Error('目前只支持 Claude Code，Codex 马上就来')
    const cwd = path.resolve(request.cwd)
    if (!isDirectory(cwd)) throw new Error(`找不到目录：${cwd}`)

    const now = this.opts.now()
    const plot: Plot = {
      id: randomUUID(),
      agent: request.agent,
      name,
      cwd,
      sessionId: randomUUID(),
      state: 'seeded',
      growth: 0,
      remoteControl: request.remoteControl,
      running: false,
      createdAt: now,
      updatedAt: now,
      waitingSince: now,
      note: null
    }
    this.plots = [...this.plots, plot]
    try {
      this.launch(plot, false)
    } catch (error) {
      this.plots = this.plots.filter((p) => p.id !== plot.id)
      throw error
    }
    return this.find(plot.id)
  }

  revive(plotId: string): void {
    const plot = this.find(plotId)
    if (this.processes.has(plotId)) return
    if (!isDirectory(plot.cwd)) throw new Error(`找不到目录：${plot.cwd}`)
    this.launch(plot, true)
  }

  stop(plotId: string): void {
    const proc = this.processes.get(plotId)
    if (!proc) return
    this.stopping.add(plotId)
    proc.kill()
  }

  harvest(plotId: string): void {
    const plot = this.find(plotId)
    if (this.processes.has(plotId)) {
      // Detach first so the exit doesn't resurrect the plot we are removing.
      const proc = this.processes.get(plotId)!
      this.processes.delete(plotId)
      proc.kill()
    }
    this.plots = this.plots.filter((p) => p.id !== plotId)
    this.outputs.delete(plotId)
    this.harvested = [
      {
        id: plot.id,
        name: plot.name,
        agent: plot.agent,
        cwd: plot.cwd,
        sessionId: plot.sessionId,
        plantedAt: plot.createdAt,
        harvestedAt: this.opts.now(),
        growth: plot.growth
      },
      ...this.harvested
    ].slice(0, 200)
    this.changed()
  }

  readOutput(plotId: string): OutputChunk {
    const buffer = this.outputs.get(plotId)
    return buffer ? { data: buffer.toString(), end: buffer.total } : { data: '', end: 0 }
  }

  write(plotId: string, data: string): void {
    this.processes.get(plotId)?.write(data)
  }

  resize(plotId: string, cols: number, rows: number): void {
    const proc = this.processes.get(plotId)
    if (!proc) return
    try {
      proc.resize(Math.max(20, Math.floor(cols)), Math.max(5, Math.floor(rows)))
    } catch {
      // The process may have exited between the check and the resize.
    }
  }

  /** Stop every process (plots become dormant), save and close the hook server. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const [id, proc] of this.processes) {
      this.stopping.add(id)
      try {
        proc.kill()
      } catch {
        // already gone
      }
    }
    const now = this.opts.now()
    this.plots = this.plots.map((p) => (p.running ? applyEvent(p, { type: 'exited', exitCode: 0, expected: true }, now) : p))
    this.processes.clear()
    this.flush()
    await this.hooks.close()
  }

  // -------------------------------------------------------------------------

  private launch(plot: Plot, resume: boolean): void {
    const cmd = this.opts.resolveClaude()
    if (!cmd) throw new Error('找不到 claude 命令。请先安装 Claude Code，并确认在终端里能运行 claude')

    const args = buildClaudeArgs({
      sessionId: plot.sessionId,
      resume,
      name: plot.name,
      remoteControl: plot.remoteControl,
      settingsPath: this.settingsPath
    })
    const spec = toSpawnSpec(cmd, args, this.opts.platform, this.opts.env.ComSpec)
    const proc = this.opts.spawn(spec.file, spec.args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 32,
      cwd: plot.cwd,
      env: childEnv(this.opts.env, { [HOOK_ENV.token]: this.hooks.token, [HOOK_ENV.plotId]: plot.id })
    })

    this.processes.set(plot.id, proc)
    if (!this.outputs.has(plot.id)) this.outputs.set(plot.id, new OutputBuffer())
    const buffer = this.outputs.get(plot.id)!

    proc.onData((data) => {
      const start = buffer.total
      buffer.push(data)
      this.emit('output', plot.id, data, start)
    })
    proc.onExit(({ exitCode }) => {
      // Ignore exits of processes we already detached (harvest) or replaced.
      if (this.processes.get(plot.id) !== proc) return
      this.processes.delete(plot.id)
      const expected = this.stopping.delete(plot.id)
      this.update(plot.id, { type: 'exited', exitCode, expected })
    })

    this.update(plot.id, { type: 'spawned', resumed: resume })
  }

  private onHook(plotId: string, name: string, payload: Record<string, unknown>): void {
    if (!this.plots.some((p) => p.id === plotId)) return
    this.update(plotId, { type: 'hook', name, payload })
  }

  private update(plotId: string, event: PlotEvent): void {
    const before = this.plots.find((p) => p.id === plotId)
    if (!before) return
    const after = applyEvent(before, event, this.opts.now())
    if (after === before) return
    this.plots = this.plots.map((p) => (p.id === plotId ? after : p))
    if (after.running && isWaiting(after.state) && after.state !== before.state && after.state !== 'seeded') {
      this.emit('attention', after)
    }
    this.changed()
  }

  private find(plotId: string): Plot {
    const plot = this.plots.find((p) => p.id === plotId)
    if (!plot) throw new Error('这块地不存在了')
    return plot
  }

  private changed(): void {
    if (this.disposed) return
    this.emit('snapshot', this.snapshot())
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.flush()
    }, 300)
  }

  private flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    saveFarm(this.opts.dataDir, this.snapshot())
  }
}

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}
