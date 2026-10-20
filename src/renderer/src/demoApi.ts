// A simulated farm for running the UI in a plain browser (`npm run web`).
// Nothing here talks to a real agent; events go through the same reducers as the
// real app so the visuals match.

import type { FarmApi } from '../../shared/api'
import { applyChatEvent, type ChatEvent, type ChatItem } from '../../shared/chat'
import { applyEvent, freeSlot, type PlotEvent } from '../../shared/plotMachine'
import type { FarmSnapshot, Plot, PlantRequest } from '../../shared/types'

type Hook = [name: string, payload: Record<string, unknown>]

export function createDemoApi(): FarmApi {
  const now = Date.now()
  const minutes = (n: number): number => now - n * 60_000
  let seq = 0
  let turn = 0

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
    slot: seq - 1,
    ...overrides
  })

  const chats = new Map<string, ChatItem[]>()
  const snapshotListeners = new Set<(s: FarmSnapshot) => void>()
  const chatListeners = new Set<(id: string, items: ChatItem[]) => void>()

  let snapshot: FarmSnapshot = {
    plots: [
      make('重构登录模块', { growth: 8 }),
      make('修复 CI', { state: 'pest', waitingSince: minutes(2), note: '等待批准：Bash' }),
      make('写周报', { state: 'thirsty', growth: 5, waitingSince: minutes(14), note: '有问题要问你' }),
      make('数据迁移脚本', { state: 'thirsty', growth: 9, waitingSince: minutes(42) }),
      make('翻译文档', { state: 'ripe', growth: 14, running: false }),
      make('单元测试', { agent: 'codex', state: 'ripe', growth: 10, running: false }),
      make('老项目调研', { state: 'dormant', growth: 4, running: false }),
      make('部署脚本', { state: 'withered', growth: 2, note: '出错：API overloaded' })
    ],
    harvested: []
  }

  const publish = (): void => snapshotListeners.forEach((l) => l(snapshot))

  const chat = (id: string, event: ChatEvent): void => {
    const before = chats.get(id) ?? []
    const after = applyChatEvent(before, event, Date.now())
    if (after === before) return
    chats.set(id, after)
    const old = new Set(before)
    const changed = after.filter((i) => !old.has(i))
    chatListeners.forEach((l) => l(id, changed))
  }

  const hook = (id: string, name: string, payload: Record<string, unknown> = {}): void => {
    const event = { type: 'hook' as const, name, payload }
    chat(id, event)
    plotEvent(id, event)
  }

  const plotEvent = (id: string, event: PlotEvent): void => {
    snapshot = { ...snapshot, plots: snapshot.plots.map((p) => (p.id === id ? applyEvent(p, event, Date.now()) : p)) }
    publish()
  }

  /** Replay a turn's hooks one by one, like a real session would send them. */
  const play = (id: string, hooks: Hook[], gap = 450): void => {
    hooks.forEach(([name, payload], i) => setTimeout(() => hook(id, name, payload), (i + 1) * gap))
  }

  const reply = (text: string): Hook[] => {
    const turnId = `t${++turn}`
    const lines = text.split('\n')
    return [
      ...lines.map((line, i): Hook => ['MessageDisplay', { turn_id: turnId, message_id: 1, delta: `${line}\n`, final: i === lines.length - 1 }]),
      ['Stop', { last_assistant_message: text }]
    ]
  }

  // Seed the demo conversations without notifications.
  const seed = (id: string, events: Hook[]): void => {
    for (const [name, payload] of events) chats.set(id, applyChatEvent(chats.get(id) ?? [], { type: 'hook', name, payload }, minutes(5)))
  }
  const [refactor, ci, report, migrate, translate, unitTest, research, deploy] = snapshot.plots.map((p) => p.id)

  seed(refactor, [
    ['UserPromptSubmit', { prompt: '把登录模块改成用 token 校验，旧的 session 方式先保留', prompt_id: 'a1' }],
    ['PreToolUse', { tool_name: 'Grep', tool_use_id: 'r1', tool_input: { pattern: 'session.user' } }],
    ['PostToolUse', { tool_name: 'Grep', tool_use_id: 'r1', tool_response: 'src/auth/login.ts:42\nsrc/auth/middleware.ts:17' }],
    ['PreToolUse', { tool_name: 'Read', tool_use_id: 'r2', tool_input: { file_path: 'src/auth/login.ts' } }],
    ['PostToolUse', { tool_name: 'Read', tool_use_id: 'r2', tool_response: '…' }],
    ['MessageDisplay', { turn_id: 'x1', message_id: 1, delta: '找到两处用到 `session.user` 的地方，我先改 **middleware**，再加 token 校验。\n', final: true }],
    ['PreToolUse', { tool_name: 'Edit', tool_use_id: 'r3', tool_input: { file_path: 'src/auth/middleware.ts' } }]
  ])
  seed(ci, [
    ['UserPromptSubmit', { prompt: 'CI 上测试挂了，帮我看看', prompt_id: 'b1' }],
    ['PreToolUse', { tool_name: 'Read', tool_use_id: 'c1', tool_input: { file_path: '.github/workflows/ci.yml' } }],
    ['PostToolUse', { tool_name: 'Read', tool_use_id: 'c1', tool_response: '…' }],
    ['MessageDisplay', { turn_id: 'x2', message_id: 1, delta: '我想先在本地把测试跑一遍，确认是哪一个挂了。\n', final: true }],
    ['PreToolUse', { tool_name: 'Bash', tool_use_id: 'c2', tool_input: { command: 'npm test' } }],
    ['PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'npm test' } }]
  ])
  seed(report, [
    ['UserPromptSubmit', { prompt: '根据这周的提交记录写一份周报', prompt_id: 'c1' }],
    ['PreToolUse', { tool_name: 'Bash', tool_use_id: 'w1', tool_input: { command: 'git log --since="1 week ago" --oneline' } }],
    ['PostToolUse', { tool_name: 'Bash', tool_use_id: 'w1', tool_response: { stdout: '3f2a1c0 修复登录超时\n9b7e2d4 增加导出功能\n…', stderr: '' } }],
    ['PreToolUse', { tool_name: 'AskUserQuestion', tool_use_id: 'w2', tool_input: { questions: [{ question: '周报发给谁看？', options: [{ label: '团队群' }, { label: '老板邮件' }, { label: '两个都要' }] }] } }]
  ])
  seed(migrate, [
    ['UserPromptSubmit', { prompt: '写一个把用户表从 MySQL 迁到 Postgres 的脚本', prompt_id: 'd1' }],
    ...reply('脚本写好了，放在 `scripts/migrate-users.ts`。\n\n要点：\n- 分批迁移，每批 1000 行\n- 迁移前会先做一次行数核对\n\n要我先在测试库上跑一遍吗？')
  ])
  seed(translate, [['UserPromptSubmit', { prompt: '把 docs/ 翻译成英文', prompt_id: 'e1' }], ...reply('全部翻译完了，一共 12 个文件。')])
  seed(unitTest, [['UserPromptSubmit', { prompt: '给 utils 补单元测试', prompt_id: 'f1' }], ...reply('补了 18 个测试，全部通过。')])
  seed(research, [['UserPromptSubmit', { prompt: '调研一下这个老项目还有哪些依赖没升级', prompt_id: 'g1' }], ...reply('列了一份清单，主要是 3 个大版本落后的依赖。')])
  seed(deploy, [['UserPromptSubmit', { prompt: '写个一键部署脚本', prompt_id: 'h1' }], ['StopFailure', { error: 'overloaded', last_assistant_message: 'API Error: overloaded' }]])
  chats.set(research, applyChatEvent(chats.get(research)!, { type: 'exited', exitCode: 0, expected: true }, minutes(4)))
  chats.set(translate, applyChatEvent(chats.get(translate)!, { type: 'exited', exitCode: 0, expected: false }, minutes(4)))
  chats.set(unitTest, applyChatEvent(chats.get(unitTest)!, { type: 'exited', exitCode: 0, expected: false }, minutes(4)))

  // Growing plots keep working on their own.
  setInterval(() => {
    for (const plot of snapshot.plots) {
      if (plot.state !== 'growing' || !plot.running) continue
      const id = `auto-${++turn}`
      hook(plot.id, 'PostToolUse', { tool_name: 'Edit', tool_use_id: id })
      if (Math.random() < 0.12) play(plot.id, reply('这一步做完了。接下来要我继续吗？'))
    }
  }, 4000)

  const pendingQuestion = (id: string) => (chats.get(id) ?? []).find((i) => i.kind === 'question' && i.status === 'pending')

  return {
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
        slot: freeSlot(snapshot.plots),
        cwd: request.cwd || `~/projects/${request.name.trim()}`,
        state: 'seeded',
        growth: 0,
        createdAt: Date.now(),
        waitingSince: Date.now(),
        remoteControl: request.remoteControl
      })
      snapshot = { ...snapshot, plots: [...snapshot.plots, plot] }
      chat(plot.id, { type: 'spawned', resumed: false })
      publish()
      return plot
    },
    async pickDirectory() {
      return null
    },
    async revive(id) {
      chat(id, { type: 'spawned', resumed: true })
      plotEvent(id, { type: 'spawned', resumed: true })
    },
    async stop(id) {
      chat(id, { type: 'exited', exitCode: 0, expected: true })
      plotEvent(id, { type: 'exited', exitCode: 0, expected: true })
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
    async readChat(id) {
      return chats.get(id) ?? []
    },
    onChat(listener) {
      chatListeners.add(listener)
      return () => chatListeners.delete(listener)
    },
    async sendMessage(id, text) {
      const tool = `demo-tool-${++turn}`
      hook(id, 'UserPromptSubmit', { prompt: text, prompt_id: crypto.randomUUID() })
      play(id, [
        ['PreToolUse', { tool_name: 'Read', tool_use_id: tool, tool_input: { file_path: 'README.md' } }],
        ['PostToolUse', { tool_name: 'Read', tool_use_id: tool, tool_response: '（演示内容）' }],
        ...reply(`收到：「${text}」\n\n这是**演示模式**，我只会假装干活。真实的 app 里，这里是 Claude Code 的回复。`)
      ])
    },
    async respondPermission(id, itemId, allow) {
      chat(id, { type: 'permission-answered', itemId, allow })
      const tool = (chats.get(id) ?? []).findLast((i) => i.kind === 'tool' && i.status === 'running')?.id.replace(/^tool-/, '')
      if (allow) {
        play(id, [['PostToolUse', { tool_name: 'Bash', tool_use_id: tool, tool_response: { stdout: 'Tests: 35 passed', stderr: '' } }], ...reply('测试都过了，CI 上挂是因为缓存过期。')])
      } else {
        play(id, reply('好的，不跑了。你想让我换个方式吗？'))
      }
    },
    async pickOption(id, label) {
      const question = pendingQuestion(id)
      if (!question) throw new Error(`没找到选项「${label}」`)
      const tool = question.id.replace(/^tool-/, '')
      play(id, [['PostToolUse', { tool_name: 'AskUserQuestion', tool_use_id: tool }], ...reply(`好的，就按「${label}」来写。`)])
    },
    sendKey() {},
    async readScreen(id) {
      const question = pendingQuestion(id)
      if (question?.kind !== 'question') return { text: '', dialog: false, known: null }
      const q = question.questions[0]
      return { text: [q.question, ...q.options.map((o, i) => `${i === 0 ? '❯' : ' '} ${i + 1}. ${o}`)].join('\n'), dialog: true, known: null }
    }
  }
}
