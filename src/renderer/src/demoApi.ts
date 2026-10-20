// A simulated farm for running the UI in a plain browser (`npm run web`).
// Nothing here talks to a real agent.

import type { FarmApi } from '../../shared/api'
import { applyEvent, type PlotEvent } from '../../shared/plotMachine'
import type { FarmSnapshot, Plot, PlantRequest } from '../../shared/types'

const PROMPT = '\r\n\x1b[38;5;180m>\x1b[0m '

export function createDemoApi(): FarmApi {
  const now = Date.now()
  const minutes = (n: number): number => now - n * 60_000
  let seq = 0

  const make = (name: string, overrides: Partial<Plot>): Plot => ({
    id: `demo-${++seq}`,
    agent: 'claude',
    name,
    cwd: `~/projects/${name}`,
    sessionId: crypto.randomUUID(),
    state: 'growing',
    growth: 3,
    remoteControl: true,
    running: true,
    createdAt: minutes(90),
    updatedAt: now,
    waitingSince: null,
    note: null,
    ...overrides
  })

  let snapshot: FarmSnapshot = {
    plots: [
      make('重构登录模块', { growth: 8 }),
      make('修复 CI', { state: 'pest', waitingSince: minutes(2), note: '等待批准：Bash(npm test)' }),
      make('写周报', { state: 'thirsty', growth: 5, waitingSince: minutes(14) }),
      make('数据迁移脚本', { state: 'thirsty', growth: 9, waitingSince: minutes(42) }),
      make('翻译文档', { state: 'ripe', growth: 14, running: false }),
      make('单元测试', { agent: 'codex', state: 'ripe', growth: 10, running: false }),
      make('老项目调研', { state: 'dormant', growth: 4, running: false }),
      make('部署脚本', { state: 'withered', growth: 2, note: '出错：API overloaded' })
    ],
    harvested: []
  }

  const snapshotListeners = new Set<(s: FarmSnapshot) => void>()
  const outputListeners = new Set<(id: string, data: string, start: number) => void>()
  const outputs = new Map<string, string>()

  const publish = (): void => snapshotListeners.forEach((l) => l(snapshot))
  const print = (id: string, data: string): void => {
    const before = outputs.get(id) ?? ''
    outputs.set(id, before + data)
    outputListeners.forEach((l) => l(id, data, before.length))
  }
  const update = (id: string, event: PlotEvent): void => {
    snapshot = { ...snapshot, plots: snapshot.plots.map((p) => (p.id === id ? applyEvent(p, event, Date.now()) : p)) }
    publish()
  }
  const hook = (id: string, name: string, payload: Record<string, unknown> = {}): void =>
    update(id, { type: 'hook', name, payload })

  const greet = (plot: Plot): void => {
    print(
      plot.id,
      `\x1b[38;5;215m✻\x1b[0m \x1b[1mClaude Code\x1b[0m \x1b[38;5;245m(演示模式，不会连接真实的 agent)\x1b[0m\r\n` +
        `\x1b[38;5;245m  ${plot.cwd}\x1b[0m\r\n` +
        (plot.note ? `\r\n\x1b[38;5;203m${plot.note}\x1b[0m\r\n` : '') +
        PROMPT
    )
  }
  snapshot.plots.forEach(greet)

  // Make growing plots grow, and let them finish their turn now and then.
  setInterval(() => {
    for (const plot of snapshot.plots) {
      if (plot.state !== 'growing' || !plot.running) continue
      hook(plot.id, 'PostToolUse')
      if (Math.random() < 0.12) {
        print(plot.id, '\r\n\x1b[38;5;114m⏺\x1b[0m 这一步做完了，接下来要我做什么？' + PROMPT)
        hook(plot.id, 'Stop')
      }
    }
  }, 4000)

  const lines = new Map<string, string>()

  const api: FarmApi = {
    async getSnapshot() {
      return snapshot
    },
    onSnapshot(listener) {
      snapshotListeners.add(listener)
      return () => snapshotListeners.delete(listener)
    },
    onFocusPlot() {
      return () => {}
    },
    async info() {
      return { platform: 'demo', claudePath: null, version: 'demo' }
    },
    async plant(request: PlantRequest) {
      if (!request.name.trim()) throw new Error('请给这块地起个名字')
      const plot = make(request.name.trim(), {
        cwd: request.cwd || `~/projects/${request.name.trim()}`,
        state: 'seeded',
        growth: 0,
        createdAt: Date.now(),
        waitingSince: Date.now(),
        remoteControl: request.remoteControl
      })
      snapshot = { ...snapshot, plots: [...snapshot.plots, plot] }
      greet(plot)
      publish()
      return plot
    },
    async pickDirectory() {
      return null
    },
    async revive(id) {
      update(id, { type: 'spawned', resumed: true })
      print(id, '\r\n\x1b[38;5;245m（已唤醒，接着上次的对话）\x1b[0m' + PROMPT)
    },
    async stop(id) {
      update(id, { type: 'exited', exitCode: 0, expected: true })
    },
    async harvest(id) {
      const plot = snapshot.plots.find((p) => p.id === id)
      if (!plot) return
      snapshot = {
        plots: snapshot.plots.filter((p) => p.id !== id),
        harvested: [
          { id, name: plot.name, agent: plot.agent, cwd: plot.cwd, sessionId: plot.sessionId, plantedAt: plot.createdAt, harvestedAt: Date.now(), growth: plot.growth },
          ...snapshot.harvested
        ]
      }
      publish()
    },
    async readOutput(id) {
      const data = outputs.get(id) ?? ''
      return { data, end: data.length }
    },
    onOutput(listener) {
      outputListeners.add(listener)
      return () => outputListeners.delete(listener)
    },
    write(id, data) {
      const plot = snapshot.plots.find((p) => p.id === id)
      if (!plot?.running) return
      for (const ch of data) {
        if (ch === '\r') {
          const line = (lines.get(id) ?? '').trim()
          lines.set(id, '')
          if (!line) {
            print(id, PROMPT)
            continue
          }
          if (plot.state === 'pest') {
            print(id, '\r\n\x1b[38;5;114m✔ 已批准\x1b[0m\r\n')
            hook(id, 'PostToolUse')
          } else {
            hook(id, 'UserPromptSubmit')
          }
          print(id, '\r\n\x1b[38;5;215m✻\x1b[0m 思考中…\r\n')
          setTimeout(() => {
            print(id, `\x1b[38;5;114m⏺\x1b[0m 收到：「${line}」。演示模式里我只会假装干活。` + PROMPT)
            hook(id, 'Stop')
          }, 3000)
        } else if (ch === '\x7f') {
          const line = lines.get(id) ?? ''
          if (line) {
            lines.set(id, line.slice(0, -1))
            print(id, '\b \b')
          }
        } else if (ch >= ' ') {
          lines.set(id, (lines.get(id) ?? '') + ch)
          print(id, ch)
        }
      }
    },
    resize() {}
  }
  return api
}
