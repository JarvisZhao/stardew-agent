import { describe, expect, it } from 'vitest'
import { applyChatEvent, MAX_CHAT_ITEMS, previewOutput, summarizeTool, type ChatEvent, type ChatItem } from './chat'

const hook = (name: string, payload: Record<string, unknown> = {}): ChatEvent => ({ type: 'hook', name, payload })

function run(events: ChatEvent[], start: ChatItem[] = []): ChatItem[] {
  return events.reduce((log, e, i) => applyChatEvent(log, e, 1000 + i), start)
}

describe('applyChatEvent', () => {
  it('builds a turn from prompt, streamed reply, and tools', () => {
    const log = run([
      hook('UserPromptSubmit', { prompt: '帮我跑测试', prompt_id: 'p1' }),
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'npm test' } }),
      hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 't1', tool_response: { stdout: 'ok', stderr: '' } }),
      hook('MessageDisplay', { turn_id: 'a', message_id: 1, delta: '测试都过了\n', final: false }),
      hook('MessageDisplay', { turn_id: 'a', message_id: 1, delta: '一共 35 个\n', final: true }),
      hook('Stop', { last_assistant_message: '测试都过了\n一共 35 个' })
    ])
    expect(log.map((i) => i.kind)).toEqual(['user', 'tool', 'assistant'])
    expect(log[0]).toMatchObject({ text: '帮我跑测试' })
    expect(log[1]).toMatchObject({ title: '运行命令', detail: 'npm test', status: 'done', output: 'ok' })
    expect(log[2]).toMatchObject({ text: '测试都过了\n一共 35 个\n', streaming: false })
  })

  it('falls back to the Stop message when no MessageDisplay arrived', () => {
    const log = run([hook('UserPromptSubmit', { prompt: 'hi', prompt_id: 'p1' }), hook('Stop', { last_assistant_message: '你好！' })])
    expect(log[1]).toMatchObject({ kind: 'assistant', text: '你好！', streaming: false })
  })

  it('does not duplicate the prompt if the hook repeats', () => {
    const log = run([hook('UserPromptSubmit', { prompt: 'hi', prompt_id: 'p1' }), hook('UserPromptSubmit', { prompt: 'hi', prompt_id: 'p1' })])
    expect(log).toHaveLength(1)
  })

  it('tracks a permission from request to answer', () => {
    const asked = run([hook('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'rm -rf build' } })])
    expect(asked[0]).toMatchObject({ kind: 'permission', title: '运行命令', detail: 'rm -rf build', status: 'pending' })

    const allowed = applyChatEvent(asked, { type: 'permission-answered', itemId: asked[0].id, allow: true }, 2000)
    expect(allowed[0]).toMatchObject({ status: 'allowed' })

    // Answered elsewhere (e.g. phone): the tool running settles it as allowed.
    const viaTool = applyChatEvent(asked, hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'x' }), 2000)
    expect(viaTool[0]).toMatchObject({ status: 'allowed' })

    // Denied elsewhere: the turn ends and the request is just resolved.
    const viaStop = applyChatEvent(asked, hook('Stop', {}), 2000)
    expect(viaStop[0]).toMatchObject({ status: 'resolved' })
  })

  it('shows AskUserQuestion as a question with its options', () => {
    const log = run([
      hook('PreToolUse', {
        tool_name: 'AskUserQuestion',
        tool_use_id: 'q1',
        tool_input: { questions: [{ question: '用哪个数据库？', options: [{ label: 'SQLite' }, { label: 'Postgres' }] }] }
      })
    ])
    expect(log[0]).toMatchObject({ kind: 'question', status: 'pending', questions: [{ question: '用哪个数据库？', options: ['SQLite', 'Postgres'] }] })
    expect(applyChatEvent(log, hook('PostToolUse', { tool_name: 'AskUserQuestion', tool_use_id: 'q1' }), 5)[0]).toMatchObject({ status: 'answered' })
  })

  it('ignores subagent tool calls', () => {
    expect(run([hook('PreToolUse', { tool_name: 'Read', tool_use_id: 't', agent_id: 'sub' })])).toEqual([])
  })

  it('adds notices for process events and errors', () => {
    const log = run([
      { type: 'spawned', resumed: true },
      hook('StopFailure', { error: 'rate_limit', last_assistant_message: 'API Error: Rate limit reached' }),
      { type: 'exited', exitCode: 2, expected: false }
    ])
    expect(log.map((i) => (i.kind === 'notice' ? [i.tone, i.text] : null))).toEqual([
      ['info', '已唤醒，接着上次的对话'],
      ['error', 'API Error: Rate limit reached'],
      ['error', '会话异常退出（代码 2）']
    ])
  })

  it('caps the log length', () => {
    let log: ChatItem[] = []
    for (let i = 0; i < MAX_CHAT_ITEMS + 20; i++) log = applyChatEvent(log, hook('UserPromptSubmit', { prompt: `m${i}`, prompt_id: `p${i}` }), i)
    expect(log).toHaveLength(MAX_CHAT_ITEMS)
    expect(log.at(-1)).toMatchObject({ text: `m${MAX_CHAT_ITEMS + 19}` })
  })
})

describe('tool summaries', () => {
  it('describe common tools in plain words', () => {
    expect(summarizeTool('Edit', { file_path: 'src/a.ts' })).toEqual({ title: '修改文件', detail: 'src/a.ts' })
    expect(summarizeTool('mcp__x__y', { a: 1 })).toEqual({ title: 'mcp__x__y', detail: '{"a":1}' })
  })

  it('preview tool output and cut long text', () => {
    expect(previewOutput({ stdout: 'a', stderr: 'b' })).toBe('a\nb')
    expect(previewOutput('x'.repeat(5000))).toContain('后面还有 1000 个字符')
    expect(previewOutput(undefined)).toBeNull()
  })
})
