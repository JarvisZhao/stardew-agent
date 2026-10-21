import { describe, expect, it } from 'vitest'
import type { Plot } from '../../../shared/types'
import { junimoBubble, junimoColour, junimoDestination, junimoTargets } from './junimos'
import { layoutWorld, TILE } from './layout'
import { planRoute } from './walker'

function plot(overrides: Partial<Plot>): Plot {
  return {
    id: 'p',
    agent: 'claude',
    name: 'p',
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

describe('junimo rules', () => {
  it('goes where the work is', () => {
    expect(junimoDestination(plot({ activity: 'edit' }))).toBe('plot')
    expect(junimoDestination(plot({ activity: 'command' }))).toBe('blacksmith')
    expect(junimoDestination(plot({ activity: 'read' }))).toBe('museum')
    expect(junimoDestination(plot({ activity: 'search' }))).toBe('mine')
    expect(junimoDestination(plot({ activity: 'delegate' }))).toBe('plaza')
    expect(junimoDestination(plot({ activity: 'think' }))).toBe('plot')
  })

  it('waits on the plaza when it needs you and rests in the hut otherwise', () => {
    expect(junimoDestination(plot({ state: 'pest' }))).toBe('plaza')
    expect(junimoDestination(plot({ state: 'thirsty', note: '有问题要问你' }))).toBe('plaza')
    expect(junimoDestination(plot({ state: 'thirsty' }))).toBe('hut')
    expect(junimoDestination(plot({ state: 'dormant', running: false }))).toBe('hut')
    expect(junimoDestination(plot({ state: 'ripe', running: false }))).toBe('bin')
    expect(junimoBubble(plot({ state: 'pest' }))).toBe('exclaim')
    expect(junimoBubble(plot({ state: 'thirsty' }))).toBe('drop')
    expect(junimoBubble(plot({ activity: 'command' }))).toBe('fire')
  })

  it('gives each session a stable colour', () => {
    expect(junimoColour('abc')).toBe(junimoColour('abc'))
  })

  it('spreads Junimos at the same place apart', () => {
    const layout = layoutWorld([0, 1, 2])
    const targets = junimoTargets(layout, [
      plot({ id: 'a', slot: 0, activity: 'command' }),
      plot({ id: 'b', slot: 1, activity: 'command' }),
      plot({ id: 'c', slot: 2, activity: 'edit' })
    ])
    expect(targets.get('a')).not.toEqual(targets.get('b'))
    expect(Math.abs(targets.get('a')!.x - layout.places.blacksmith.x)).toBeLessThan(40)
    expect(targets.get('c')!.y).toBeGreaterThan(layout.field.ty * TILE)
  })
})

describe('routes', () => {
  const layout = layoutWorld([0])
  const gateX = (layout.field.tx + (layout.field.gate.from + layout.field.gate.to) / 2) * TILE

  it('crosses the river on a bridge', () => {
    const from = { x: 30 * TILE, y: 15 * TILE }
    const to = { x: 52 * TILE, y: 9 * TILE }
    const route = planRoute(layout, from, to)
    expect(route).toHaveLength(3)
    expect(route[0].x).toBeLessThan(layout.river.tx * TILE)
    expect(route[1].x).toBeGreaterThan((layout.river.tx + layout.river.tw) * TILE)
  })

  it('leaves the field through the gate before crossing the river', () => {
    const inField = { x: (layout.field.tx + 3) * TILE, y: (layout.field.ty + 4) * TILE }
    const route = planRoute(layout, inField, { x: 52 * TILE, y: 20 * TILE })
    expect(route[0].x).toBe(gateX)
    expect(route[1].x).toBe(gateX)
    expect(route).toHaveLength(5)
  })

  it('walks straight when nothing is in the way', () => {
    expect(planRoute(layout, { x: 30 * TILE, y: 12 * TILE }, { x: 32 * TILE, y: 20 * TILE })).toHaveLength(1)
  })
})
