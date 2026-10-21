import { describe, expect, it } from 'vitest'
import { activityOf, applyEvent, freeSlot, growthStage, nextPlotToTend, wiltLevel, type PlotEvent } from './plotMachine'
import type { Plot } from './types'

const T0 = 1_700_000_000_000

function plot(overrides: Partial<Plot> = {}): Plot {
  return {
    id: 'p1',
    agent: 'claude',
    name: 'test',
    cwd: '/tmp',
    sessionId: 's1',
    state: 'seeded',
    growth: 0,
    remoteControl: false,
    running: true,
    createdAt: T0,
    updatedAt: T0,
    waitingSince: T0,
    note: null,
    slot: 0,
    activity: null,
    lastPrompt: null,
    summary: null,
    ...overrides
  }
}

const hook = (name: string, payload: Record<string, unknown> = {}): PlotEvent => ({ type: 'hook', name, payload })

function run(start: Plot, events: PlotEvent[]): Plot {
  return events.reduce((p, e, i) => applyEvent(p, e, T0 + (i + 1) * 1000), start)
}

describe('applyEvent', () => {
  it('walks a normal turn: prompt → tools → stop', () => {
    const p = run(plot(), [hook('UserPromptSubmit'), hook('PostToolUse'), hook('PostToolUse'), hook('Stop')])
    expect(p.state).toBe('thirsty')
    expect(p.growth).toBe(3)
    expect(p.waitingSince).toBe(T0 + 4000)
  })

  it('turns a permission request into a pest and clears it when the tool finishes', () => {
    const pest = run(plot({ state: 'growing' }), [hook('PermissionRequest', { tool_name: 'Bash' })])
    expect(pest.state).toBe('pest')
    expect(pest.note).toContain('Bash')

    const after = applyEvent(pest, hook('PostToolUse'), T0 + 5000)
    expect(after.state).toBe('growing')
    expect(after.note).toBeNull()
    expect(after.waitingSince).toBeNull()
  })

  it('keeps the original waiting time when the same waiting state is reported again', () => {
    const pest = applyEvent(plot({ state: 'growing' }), hook('PermissionRequest', { tool_name: 'Edit' }), T0 + 1000)
    const again = applyEvent(pest, hook('Notification', { notification_type: 'permission_prompt', message: 'needs Edit' }), T0 + 9000)
    expect(again.state).toBe('pest')
    expect(again.waitingSince).toBe(T0 + 1000)
    expect(again.note).toBe('needs Edit')
  })

  it('only lets idle_prompt dry out a growing plot', () => {
    expect(applyEvent(plot({ state: 'growing', waitingSince: null }), hook('Notification', { notification_type: 'idle_prompt' }), T0).state).toBe('thirsty')
    expect(applyEvent(plot({ state: 'pest' }), hook('Notification', { notification_type: 'idle_prompt' }), T0).state).toBe('pest')
  })

  it('ignores subagent stops and subagent tool calls for the waiting state', () => {
    const idle = plot({ state: 'thirsty' })
    const p = run(idle, [hook('PostToolUse', { agent_id: 'a1' }), hook('Stop', { agent_id: 'a1' }), hook('SubagentStop', { agent_id: 'a1' })])
    expect(p.state).toBe('thirsty')
    expect(p.growth).toBe(2)
  })

  it('tracks session id changes, e.g. after /clear', () => {
    const p = applyEvent(plot({ state: 'thirsty', growth: 9 }), hook('UserPromptSubmit', { session_id: 's2' }), T0)
    expect(p.sessionId).toBe('s2')
    expect(p.state).toBe('growing')
  })

  it('treats a resumed session as waiting for input', () => {
    const p = applyEvent(plot({ state: 'dormant', running: false }), { type: 'spawned', resumed: true }, T0)
    expect(p).toMatchObject({ state: 'thirsty', running: true })
  })

  it('withers on API errors and recovers on the next prompt', () => {
    const bad = applyEvent(plot({ state: 'growing' }), hook('StopFailure', { error: 'overloaded' }), T0)
    expect(bad.state).toBe('withered')
    expect(bad.note).toContain('overloaded')
    expect(applyEvent(bad, hook('UserPromptSubmit'), T0 + 1).state).toBe('growing')
  })

  it('ripens on a clean exit, withers on a crash, sleeps when we stopped it', () => {
    const live = plot({ state: 'thirsty' })
    expect(applyEvent(live, { type: 'exited', exitCode: 0, expected: false }, T0)).toMatchObject({ state: 'ripe', running: false })
    expect(applyEvent(live, { type: 'exited', exitCode: 1, expected: false }, T0)).toMatchObject({ state: 'withered', running: false })
    expect(applyEvent(live, { type: 'exited', exitCode: 1, expected: true }, T0)).toMatchObject({ state: 'dormant', running: false })
  })

  it('waits on the user when Claude asks a multiple-choice question', () => {
    const p = applyEvent(plot({ state: 'growing', waitingSince: null }), hook('PreToolUse', { tool_name: 'AskUserQuestion' }), T0)
    expect(p).toMatchObject({ state: 'thirsty', note: '有问题要问你' })
    expect(applyEvent(p, hook('PostToolUse', { tool_name: 'AskUserQuestion' }), T0 + 1).state).toBe('growing')
  })

  it('returns the same object when nothing changes', () => {
    const p = plot({ state: 'thirsty' })
    expect(applyEvent(p, hook('PreToolUse'), T0 + 1)).toBe(p)
    expect(applyEvent(p, hook('SomethingNew'), T0 + 1)).toBe(p)
  })
})

describe('freeSlot', () => {
  it('reuses the lowest gap', () => {
    expect(freeSlot([])).toBe(0)
    expect(freeSlot([{ slot: 0 }, { slot: 2 }])).toBe(1)
    expect(freeSlot([{ slot: 1 }, { slot: 0 }])).toBe(2)
  })
})

describe('derived visuals', () => {
  it('maps growth to a stage and keeps the mature crop for ripe plots', () => {
    expect(growthStage({ state: 'seeded', growth: 0 })).toBe('seed')
    expect(growthStage({ state: 'growing', growth: 2 })).toBe('sprout')
    expect(growthStage({ state: 'thirsty', growth: 30 })).toBe('young')
    expect(growthStage({ state: 'ripe', growth: 0 })).toBe('mature')
  })

  it('wilts waiting plots over time', () => {
    const waiting = { state: 'thirsty' as const, waitingSince: T0 }
    expect(wiltLevel(waiting, T0 + 5 * 60_000)).toBe(0)
    expect(wiltLevel(waiting, T0 + 15 * 60_000)).toBe(1)
    expect(wiltLevel(waiting, T0 + 45 * 60_000)).toBe(2)
    expect(wiltLevel({ state: 'growing', waitingSince: null }, T0 + 99 * 60_000)).toBe(0)
  })

  it('picks pests first, then the longest-waiting plot', () => {
    const plots = [
      plot({ id: 'a', state: 'thirsty', waitingSince: T0 }),
      plot({ id: 'b', state: 'pest', waitingSince: T0 + 5000 }),
      plot({ id: 'c', state: 'thirsty', waitingSince: T0 - 5000 }),
      plot({ id: 'd', state: 'pest', waitingSince: T0 - 1, running: false })
    ]
    expect(nextPlotToTend(plots)?.id).toBe('b')
    expect(nextPlotToTend(plots.filter((p) => p.id !== 'b'))?.id).toBe('c')
  })
})

describe('activity and summaries', () => {
  it('follows the latest main-thread tool and clears when the turn ends', () => {
    let p = applyEvent(plot(), hook('UserPromptSubmit', { prompt: '  修一下\n登录的  bug ' }), T0)
    expect(p).toMatchObject({ activity: 'think', lastPrompt: '修一下 登录的 bug' })
    p = applyEvent(p, hook('PreToolUse', { tool_name: 'Grep' }), T0 + 1)
    expect(p.activity).toBe('search')
    p = applyEvent(p, hook('PreToolUse', { tool_name: 'Bash' }), T0 + 2)
    expect(p.activity).toBe('command')
    p = applyEvent(p, hook('PreToolUse', { tool_name: 'Edit', agent_id: 'sub' }), T0 + 3)
    expect(p.activity).toBe('command')
    p = applyEvent(p, hook('Stop', { last_assistant_message: '修好了，测试都过了。' }), T0 + 4)
    expect(p).toMatchObject({ activity: null, summary: '修好了，测试都过了。' })
  })

  it('maps tools to parts of town', () => {
    expect(['Edit', 'Write', 'Bash', 'Read', 'WebSearch', 'Glob', 'Task', 'TodoWrite', 'mcp__x__y'].map(activityOf)).toEqual([
      'edit',
      'edit',
      'command',
      'read',
      'read',
      'search',
      'delegate',
      'think',
      'read'
    ])
  })

  it('cuts long summaries', () => {
    const p = applyEvent(plot({ state: 'growing' }), hook('Stop', { last_assistant_message: 'x'.repeat(500) }), T0)
    expect(p.summary).toHaveLength(161)
  })
})
