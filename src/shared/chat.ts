// The conversation shown in a plot's chat panel, rebuilt from Claude Code hooks.
// Pure functions only; the farm engine stores the result per plot.

export type ChatItem =
  | { kind: 'user'; id: string; at: number; text: string }
  | { kind: 'assistant'; id: string; at: number; text: string; streaming: boolean }
  | { kind: 'tool'; id: string; at: number; tool: string; title: string; detail: string; status: 'running' | 'done' | 'failed'; output: string | null }
  | { kind: 'permission'; id: string; at: number; tool: string; title: string; detail: string; status: PermissionStatus }
  | { kind: 'question'; id: string; at: number; questions: Question[]; status: 'pending' | 'answered' | 'resolved' }
  | { kind: 'notice'; id: string; at: number; tone: 'info' | 'error'; text: string }

/** `resolved` means the turn moved on without us knowing which way (e.g. answered on the phone). */
export type PermissionStatus = 'pending' | 'allowed' | 'denied' | 'resolved'

export interface Question {
  question: string
  options: string[]
}

export type ChatEvent =
  | { type: 'hook'; name: string; payload: Record<string, unknown> }
  | { type: 'spawned'; resumed: boolean }
  | { type: 'exited'; exitCode: number; expected: boolean }
  | { type: 'permission-answered'; itemId: string; allow: boolean }

export const MAX_CHAT_ITEMS = 500
const MAX_OUTPUT = 4000

/** Returns `log` itself when nothing changed, so callers can compare by identity. */
export function applyChatEvent(log: ChatItem[], event: ChatEvent, now: number): ChatItem[] {
  const next = reduce(log, event, now)
  if (next === log) return log
  return next.slice(Math.max(0, next.length - MAX_CHAT_ITEMS))
}

function reduce(log: readonly ChatItem[], event: ChatEvent, now: number): readonly ChatItem[] {
  const seq = `${now}-${log.length}`
  switch (event.type) {
    case 'spawned':
      return [...log, notice(seq, now, 'info', event.resumed ? '已唤醒，接着上次的对话' : '种下了，等你发第一条消息')]

    case 'exited': {
      const settled = settleWaiting(log)
      if (event.expected) return [...settled, notice(seq, now, 'info', '会话休眠了')]
      if (event.exitCode === 0) return [...settled, notice(seq, now, 'info', '会话结束了，可以采摘')]
      return [...settled, notice(seq, now, 'error', `会话异常退出（代码 ${event.exitCode}）`)]
    }

    case 'permission-answered':
      return update(log, event.itemId, (item) =>
        item.kind === 'permission' && item.status === 'pending' ? { ...item, status: event.allow ? 'allowed' : 'denied' } : item
      )

    case 'hook':
      return applyHook(log, event.name, event.payload, now, seq)
  }
}

function applyHook(log: readonly ChatItem[], name: string, payload: Record<string, unknown>, now: number, seq: string): readonly ChatItem[] {
  // Subagents run their own tool calls; showing them all would drown the conversation.
  const fromSubagent = str(payload.agent_id) !== null

  switch (name) {
    case 'UserPromptSubmit': {
      const text = str(payload.prompt)
      if (!text) return log
      const id = `user-${str(payload.prompt_id) ?? seq}`
      if (log.some((i) => i.id === id)) return log
      return [...settleWaiting(log), { kind: 'user', id, at: now, text }]
    }

    case 'MessageDisplay': {
      const delta = typeof payload.delta === 'string' ? payload.delta : ''
      const id = `msg-${idPart(payload.turn_id)}-${idPart(payload.message_id)}`
      const final = payload.final === true
      const existing = log.find((i) => i.id === id)
      if (existing?.kind === 'assistant') {
        return update(log, id, () => ({ ...existing, text: existing.text + delta, streaming: !final }))
      }
      if (!delta && !final) return log
      return [...log, { kind: 'assistant', id, at: now, text: delta, streaming: !final }]
    }

    case 'Stop': {
      if (fromSubagent) return log
      let next = finishStreaming(log)
      const last = str(payload.last_assistant_message)
      if (last && !hasReplySinceLastPrompt(next)) {
        next = [...next, { kind: 'assistant', id: `final-${str(payload.prompt_id) ?? seq}`, at: now, text: last, streaming: false }]
      }
      return settleWaiting(next)
    }

    case 'StopFailure': {
      const text = str(payload.last_assistant_message) ?? str(payload.error) ?? 'API 出错'
      return [...settleWaiting(finishStreaming(log)), notice(seq, now, 'error', text)]
    }

    case 'PreToolUse': {
      if (fromSubagent) return log
      const tool = str(payload.tool_name) ?? '工具'
      const id = `tool-${str(payload.tool_use_id) ?? seq}`
      if (log.some((i) => i.id === id)) return log
      const input = record(payload.tool_input)
      if (tool === 'AskUserQuestion') {
        return [...log, { kind: 'question', id, at: now, questions: parseQuestions(input), status: 'pending' }]
      }
      const { title, detail } = summarizeTool(tool, input)
      return [...log, { kind: 'tool', id, at: now, tool, title, detail, status: 'running', output: null }]
    }

    case 'PostToolUse':
    case 'PostToolUseFailure': {
      if (fromSubagent) return log
      const failed = name === 'PostToolUseFailure'
      const tool = str(payload.tool_name) ?? ''
      const id = `tool-${str(payload.tool_use_id) ?? ''}`
      let next = settlePermission(log, tool, failed ? 'resolved' : 'allowed')
      next = update(next, id, (item) => {
        if (item.kind === 'question') return { ...item, status: 'answered' }
        if (item.kind !== 'tool') return item
        const output = failed ? (str(payload.error) ?? previewOutput(payload.tool_response)) : previewOutput(payload.tool_response)
        return { ...item, status: failed ? 'failed' : 'done', output }
      })
      return next
    }

    case 'PermissionRequest': {
      const tool = str(payload.tool_name) ?? '工具'
      const input = record(payload.tool_input)
      const { title, detail } = tool === 'ExitPlanMode' ? { title: '批准这个计划？', detail: str(input.plan) ?? '' } : summarizeTool(tool, input)
      return [...log, { kind: 'permission', id: `perm-${seq}`, at: now, tool, title, detail, status: 'pending' }]
    }

    default:
      return log
  }
}

// ---------------------------------------------------------------------------
// Tool summaries, in the words a non-programmer would use.

export function summarizeTool(tool: string, input: Record<string, unknown>): { title: string; detail: string } {
  const s = (key: string): string => str(input[key]) ?? ''
  switch (tool) {
    case 'Bash':
      return { title: '运行命令', detail: s('command') }
    case 'Read':
      return { title: '读取文件', detail: s('file_path') }
    case 'Write':
      return { title: '写入文件', detail: s('file_path') }
    case 'Edit':
    case 'MultiEdit':
      return { title: '修改文件', detail: s('file_path') }
    case 'NotebookEdit':
      return { title: '修改笔记本', detail: s('notebook_path') }
    case 'Grep':
      return { title: '搜索内容', detail: s('pattern') }
    case 'Glob':
      return { title: '查找文件', detail: s('pattern') }
    case 'WebFetch':
      return { title: '读取网页', detail: s('url') }
    case 'WebSearch':
      return { title: '搜索网页', detail: s('query') }
    case 'Task':
    case 'Agent':
      return { title: '派出帮手', detail: s('description') }
    case 'TodoWrite':
      return { title: '更新待办清单', detail: '' }
    case 'ExitPlanMode':
      return { title: '提交计划', detail: s('plan') }
    default: {
      const json = Object.keys(input).length > 0 ? JSON.stringify(input) : ''
      return { title: tool, detail: json.length > 200 ? `${json.slice(0, 200)}…` : json }
    }
  }
}

export function previewOutput(response: unknown): string | null {
  if (response === undefined || response === null) return null
  let text: string
  if (typeof response === 'string') {
    text = response
  } else if (typeof response === 'object') {
    const r = response as Record<string, unknown>
    const parts = [str(r.stdout), str(r.stderr)].filter((p): p is string => p !== null)
    if (parts.length > 0) text = parts.join('\n')
    else if (typeof r.content === 'string') text = r.content
    else text = JSON.stringify(response, null, 2)
  } else {
    text = String(response)
  }
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…（后面还有 ${text.length - MAX_OUTPUT} 个字符）` : text
}

function parseQuestions(input: Record<string, unknown>): Question[] {
  const list = Array.isArray(input.questions) ? input.questions : []
  return list.map((q) => {
    const r = record(q)
    const options = Array.isArray(r.options) ? r.options.map((o) => str(record(o).label) ?? (typeof o === 'string' ? o : '')).filter(Boolean) : []
    return { question: str(r.question) ?? '', options }
  })
}

// ---------------------------------------------------------------------------
// helpers

/** Anything still waiting on the user is settled once the conversation moves on. */
function settleWaiting(log: readonly ChatItem[]): readonly ChatItem[] {
  if (!log.some((i) => (i.kind === 'permission' || i.kind === 'question') && i.status === 'pending')) return log
  return log.map((i) =>
    (i.kind === 'permission' || i.kind === 'question') && i.status === 'pending' ? { ...i, status: 'resolved' as const } : i
  )
}

function settlePermission(log: readonly ChatItem[], tool: string, status: PermissionStatus): readonly ChatItem[] {
  for (let i = log.length - 1; i >= 0; i--) {
    const item = log[i]
    if (item.kind === 'permission' && item.status === 'pending' && item.tool === tool) {
      return update(log, item.id, () => ({ ...item, status }))
    }
  }
  return log
}

function finishStreaming(log: readonly ChatItem[]): readonly ChatItem[] {
  if (!log.some((i) => i.kind === 'assistant' && i.streaming)) return log
  return log.map((i) => (i.kind === 'assistant' && i.streaming ? { ...i, streaming: false } : i))
}

function hasReplySinceLastPrompt(log: readonly ChatItem[]): boolean {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].kind === 'assistant') return true
    if (log[i].kind === 'user') return false
  }
  return false
}

function update(log: readonly ChatItem[], id: string, fn: (item: ChatItem) => ChatItem): readonly ChatItem[] {
  const index = log.findIndex((i) => i.id === id)
  if (index < 0) return log
  const changed = fn(log[index])
  if (changed === log[index]) return log
  const next = log.slice()
  next[index] = changed
  return next
}

function notice(seq: string, at: number, tone: 'info' | 'error', text: string): ChatItem {
  return { kind: 'notice', id: `note-${seq}`, at, tone, text }
}

function idPart(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
