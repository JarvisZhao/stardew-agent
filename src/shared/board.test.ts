import { describe, expect, it } from 'vitest'
import { boardGroup, sortBoard } from './board'
import type { Plot } from './types'

function plot(id: string, overrides: Partial<Plot>): Plot {
  return {
    id,
    agent: 'claude',
    name: id,
    cwd: '/',
    sessionId: 's',
    state: 'growing',
    growth: 1,
    remoteControl: false,
    running: true,
    createdAt: 0,
    updatedAt: 0,
    waitingSince: null,
    note: null,
    slot: 0,
    activity: null,
    lastPrompt: null,
    summary: null,
    ...overrides
  }
}

describe('task board', () => {
  it('puts what needs you first', () => {
    expect(boardGroup(plot('a', { state: 'pest' }))).toBe('needsYou')
    expect(boardGroup(plot('b', { state: 'thirsty', note: '有问题要问你' }))).toBe('needsYou')
    expect(boardGroup(plot('c', { state: 'thirsty' }))).toBe('waiting')
    expect(boardGroup(plot('d', { state: 'dormant', running: false }))).toBe('resting')
  })

  it('orders groups by urgency and plots by how long they waited', () => {
    const groups = sortBoard([
      plot('working', { state: 'growing', updatedAt: 5 }),
      plot('late', { state: 'thirsty', waitingSince: 100 }),
      plot('early', { state: 'thirsty', waitingSince: 10 }),
      plot('bug', { state: 'pest', waitingSince: 50 })
    ])
    expect(groups.map((g) => g.group)).toEqual(['needsYou', 'waiting', 'working'])
    expect(groups[1].plots.map((p) => p.id)).toEqual(['early', 'late'])
  })
})
