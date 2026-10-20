// The farm engine: owns the plots, their agent processes, chat logs and persistence.
// Deliberately free of Electron imports so it can be tested with plain Node.

import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IPty } from 'node-pty'
import type { KeyName, ScreenSnapshot } from '../../shared/api'
import { applyChatEvent, type ChatEvent, type ChatItem } from '../../shared/chat'
import { applyEvent, freeSlot, isWaiting, type PlotEvent } from '../../shared/plotMachine'
import type { FarmSnapshot, HarvestRecord, PlantRequest, Plot } from '../../shared/types'
import { buildClaudeArgs, buildHookSettings, childEnv, HOOK_ENV } from './claude'
import { toSpawnSpec, type ResolvedCommand } from './command'
import { startHookServer, type HookServer } from './hookServer'
import { highlightedOption, optionMatches, Screen, SCREEN_COLS, SCREEN_ROWS } from './screen'
import { loadChat, loadFarm, saveChat, saveFarm } from './store'

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
  /** Delay between pasting a message and pressing Enter, so the TUI sees them separately. */
  submitDelayMs?: number
}

export interface FarmManagerEvents {
  snapshot: [FarmSnapshot]
  /** Chat items that were added or changed for a plot. */
  chat: [plotId: string, items: ChatItem[]]
  /** A plot just started waiting on the user. */
  attention: [Plot]
}

interface Session {
  proc: IPty
  screen: Screen
}

const MAX_NAME = 60
const MAX_MESSAGE = 100_000

export class FarmManager extends EventEmitter<FarmManagerEvents> {
  private plots: Plot[]
  private harvested: HarvestRecord[]
  private readonly sessions = new Map<string, Session>()
  private readonly chats = new Map<string, ChatItem[]>()
  /** Plots whose process we are stopping on purpose; their exit makes them dormant. */
  private readonly stopping = new Set<string>()
  private readonly dirtyChats = new Set<string>()
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
    for (const plot of this.plots) this.chats.set(plot.id, loadChat(opts.dataDir, plot.id))
  }

  static async create(options: FarmManagerOptions): Promise<FarmManager> {
    const opts = {
      platform: process.platform,
      env: process.env,
      now: Date.now,
      submitDelayMs: 80,
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
    return this.sessions.size
  }

  // ---------------------------------------------------------------- plots

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
      note: null,
      slot: freeSlot(this.plots)
    }
    this.plots = [...this.plots, plot]
    this.chats.set(plot.id, [])
    try {
      this.launch(plot, false)
    } catch (error) {
      this.plots = this.plots.filter((p) => p.id !== plot.id)
      this.chats.delete(plot.id)
      throw error
    }
    return this.find(plot.id)
  }

  revive(plotId: string): void {
    const plot = this.find(plotId)
    if (this.sessions.has(plotId)) return
    if (!isDirectory(plot.cwd)) throw new Error(`找不到目录：${plot.cwd}`)
    this.launch(plot, true)
  }

  stop(plotId: string): void {
    const session = this.sessions.get(plotId)
    if (!session) return
    this.stopping.add(plotId)
    session.proc.kill()
  }

  harvest(plotId: string): void {
    const plot = this.find(plotId)
    const session = this.sessions.get(plotId)
    if (session) {
      // Detach first so the exit doesn't resurrect the plot we are removing.
      this.sessions.delete(plotId)
      session.proc.kill()
      session.screen.dispose()
    }
    this.plots = this.plots.filter((p) => p.id !== plotId)
    this.chats.delete(plotId)
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

  // ----------------------------------------------------------------- chat

  readChat(plotId: string): ChatItem[] {
    this.find(plotId)
    return this.chats.get(plotId) ?? []
  }

  /** Type a message into the session the way a person would paste it, then press Enter. */
  async sendMessage(plotId: string, text: string): Promise<void> {
    const session = this.live(plotId)
    const message = text.replace(/\r\n/g, '\n').trim()
    if (!message) return
    if (message.length > MAX_MESSAGE) throw new Error('消息太长了')
    session.proc.write(session.screen.paste(message))
    await delay(this.opts.submitDelayMs)
    if (this.sessions.get(plotId) === session) session.proc.write('\r')
  }

  /**
   * Answer the permission dialog in the TUI: pick its "Yes" option, or Esc to
   * decline. The hook itself never blocks, so the phone can answer too.
   */
  async respondPermission(plotId: string, itemId: string, allow: boolean): Promise<void> {
    const session = this.live(plotId)
    const item = this.chats.get(plotId)?.find((i) => i.id === itemId)
    if (item?.kind !== 'permission' || item.status !== 'pending') return
    if (allow) {
      if (!(await this.choose(session, 'Yes'))) throw new Error('没看到审批框，可能已经在别处处理了')
    } else {
      session.proc.write(session.screen.key('escape'))
    }
    this.updateChat(plotId, { type: 'permission-answered', itemId, allow })
  }

  async pickOption(plotId: string, label: string): Promise<void> {
    const session = this.live(plotId)
    if (!label.trim()) return
    if (!(await this.choose(session, label))) throw new Error(`没找到选项「${label}」，可能已经在别处处理了`)
  }

  sendKey(plotId: string, key: KeyName): void {
    const session = this.sessions.get(plotId)
    session?.proc.write(session.screen.key(key))
  }

  readScreen(plotId: string): ScreenSnapshot {
    this.find(plotId)
    return this.sessions.get(plotId)?.screen.snapshot() ?? { text: '', dialog: false, known: null }
  }

  /** Stop every process (plots become dormant), save and close the hook server. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const [id, session] of this.sessions) {
      this.stopping.add(id)
      try {
        session.proc.kill()
      } catch {
        // already gone
      }
      session.screen.dispose()
    }
    const now = this.opts.now()
    const asleep: PlotEvent = { type: 'exited', exitCode: 0, expected: true }
    for (const plot of this.plots) if (plot.running) this.updateChat(plot.id, asleep)
    this.plots = this.plots.map((p) => (p.running ? applyEvent(p, asleep, now) : p))
    this.sessions.clear()
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
      cols: SCREEN_COLS,
      rows: SCREEN_ROWS,
      cwd: plot.cwd,
      env: childEnv(this.opts.env, { [HOOK_ENV.token]: this.hooks.token, [HOOK_ENV.plotId]: plot.id })
    })
    const session: Session = { proc, screen: new Screen() }
    this.sessions.set(plot.id, session)

    proc.onData((data) => session.screen.write(data))
    proc.onExit(({ exitCode }) => {
      // Ignore exits of processes we already detached (harvest) or replaced.
      if (this.sessions.get(plot.id) !== session) return
      this.sessions.delete(plot.id)
      session.screen.dispose()
      const expected = this.stopping.delete(plot.id)
      this.update(plot.id, { type: 'exited', exitCode, expected })
    })

    this.update(plot.id, { type: 'spawned', resumed: resume })
  }

  /**
   * Move the menu highlight to the option starting with `label`, then press Enter.
   * Reads the screen after every key so we never confirm the wrong option (the
   * trust dialog, for one, highlights "No, exit" by default).
   */
  private async choose(session: Session, label: string): Promise<boolean> {
    const read = (): string | null => highlightedOption(session.screen.snapshot().text)
    const until = async (done: (h: string | null) => boolean, ms: number): Promise<string | null> => {
      const end = Date.now() + ms
      for (;;) {
        const h = read()
        if (done(h) || Date.now() > end || !this.isLive(session)) return h
        await delay(30)
      }
    }

    // The menu may not be drawn yet: the hook often arrives before the screen.
    let current = await until((h) => h !== null, 2000)
    const visited = new Set<string>()
    for (const direction of ['down', 'up'] as const) {
      for (let step = 0; step < 12 && current !== null; step++) {
        if (optionMatches(current, label)) {
          session.proc.write(session.screen.key('enter'))
          return true
        }
        visited.add(current)
        const before = current
        session.proc.write(session.screen.key(direction))
        current = await until((h) => h !== before, 800)
        // End of the list, or (going down) wrapped around to an option we checked.
        if (current === before || (direction === 'down' && current !== null && visited.has(current))) break
      }
    }
    return false
  }

  private isLive(session: Session): boolean {
    for (const s of this.sessions.values()) if (s === session) return true
    return false
  }

  private live(plotId: string): Session {
    this.find(plotId)
    const session = this.sessions.get(plotId)
    if (!session) throw new Error('这块地在休眠，先唤醒它')
    return session
  }

  private onHook(plotId: string, name: string, payload: Record<string, unknown>): void {
    if (!this.plots.some((p) => p.id === plotId)) return
    this.update(plotId, { type: 'hook', name, payload })
  }

  /** Feed an event to both the plot's state machine and its chat log. */
  private update(plotId: string, event: PlotEvent): void {
    this.updateChat(plotId, event)
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

  private updateChat(plotId: string, event: ChatEvent): void {
    const before = this.chats.get(plotId) ?? []
    const after = applyChatEvent(before, event, this.opts.now())
    if (after === before) return
    this.chats.set(plotId, after)
    this.dirtyChats.add(plotId)
    const old = new Set(before)
    this.emit(
      'chat',
      plotId,
      after.filter((item) => !old.has(item))
    )
    this.scheduleSave()
  }

  private find(plotId: string): Plot {
    const plot = this.plots.find((p) => p.id === plotId)
    if (!plot) throw new Error('这块地不存在了')
    return plot
  }

  private changed(): void {
    if (this.disposed) return
    this.emit('snapshot', this.snapshot())
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.disposed || this.saveTimer) return
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
    for (const plotId of this.dirtyChats) {
      const chat = this.chats.get(plotId)
      if (chat) saveChat(this.opts.dataDir, plotId, chat)
    }
    this.dirtyChats.clear()
  }
}

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
