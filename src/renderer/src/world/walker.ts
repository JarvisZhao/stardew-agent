// The farmer walking around the map: through the field gate, never through the fence.

import type { Facing } from './art'
import { TILE, type WorldLayout } from './layout'

export interface Walker {
  x: number
  y: number
  facing: Facing
  /** Mirrors the side-facing sprite when walking left. */
  left: boolean
  moving: boolean
  route: Array<{ x: number; y: number }>
  /** Distance walked, drives the step animation. */
  walked: number
}

const SPEED = 70 // world px per second

export function createWalker(x: number, y: number): Walker {
  return { x, y, facing: 'down', left: false, moving: false, route: [], walked: 0 }
}

function insideField(layout: WorldLayout, x: number, y: number): boolean {
  const f = layout.field
  return x > f.tx * TILE && x < (f.tx + f.tw) * TILE && y > f.ty * TILE && y < (f.ty + f.th) * TILE
}

/** Waypoints from the walker's position to the target, via the gate when crossing the fence. */
export function planRoute(layout: WorldLayout, from: { x: number; y: number }, to: { x: number; y: number }): Array<{ x: number; y: number }> {
  const f = layout.field
  const gateX = (f.tx + (f.gate.from + f.gate.to) / 2) * TILE
  const outside = { x: gateX, y: f.ty * TILE - 6 }
  const inside = { x: gateX, y: f.ty * TILE + 14 }
  const a = insideField(layout, from.x, from.y)
  const b = insideField(layout, to.x, to.y)
  if (a === b) return [to]
  return a ? [inside, outside, to] : [outside, inside, to]
}

export function walkTo(w: Walker, layout: WorldLayout, target: { x: number; y: number }): void {
  w.route = planRoute(layout, w, target)
}

export function stepWalker(w: Walker, dt: number): void {
  const next = w.route[0]
  if (!next) {
    w.moving = false
    return
  }
  const dx = next.x - w.x
  const dy = next.y - w.y
  const dist = Math.hypot(dx, dy)
  const move = SPEED * dt
  if (Math.abs(dx) > Math.abs(dy)) {
    w.facing = 'side'
    w.left = dx < 0
  } else {
    w.facing = dy < 0 ? 'up' : 'down'
  }
  w.moving = true
  if (dist <= move) {
    w.x = next.x
    w.y = next.y
    w.route.shift()
    if (w.route.length === 0) {
      w.moving = false
      w.facing = 'up' // face the plot
    }
  } else {
    w.x += (dx / dist) * move
    w.y += (dy / dist) * move
  }
  w.walked += Math.min(move, dist)
}

export function walkFrame(w: Walker): 0 | 1 | 2 {
  if (!w.moving) return 0
  return Math.floor(w.walked / 6) % 2 === 0 ? 1 : 2
}
