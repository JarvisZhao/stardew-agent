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

/** Which side of the river a point is on. */
function eastOfRiver(layout: WorldLayout, x: number): boolean {
  return x >= (layout.river.tx + layout.river.tw / 2) * TILE
}

/**
 * Waypoints from `from` to `to`: out through the field gate, over the nearest
 * bridge when crossing the river, back in through the gate.
 */
export function planRoute(layout: WorldLayout, from: { x: number; y: number }, to: { x: number; y: number }): Array<{ x: number; y: number }> {
  const f = layout.field
  const gateX = (f.tx + (f.gate.from + f.gate.to) / 2) * TILE
  const gateOutside = { x: gateX, y: f.ty * TILE - 6 }
  const gateInside = { x: gateX, y: f.ty * TILE + 14 }
  const route: Array<{ x: number; y: number }> = []
  const fromField = insideField(layout, from.x, from.y)
  const toField = insideField(layout, to.x, to.y)
  if (fromField && !toField) route.push(gateInside, gateOutside)

  const start = route.at(-1) ?? from
  if (eastOfRiver(layout, start.x) !== eastOfRiver(layout, to.x)) {
    // The bridge closest to the halfway height.
    const midY = (start.y + to.y) / 2
    const bridge = layout.bridges.reduce((best, b) => (Math.abs((b.ty + b.th / 2) * TILE - midY) < Math.abs((best.ty + best.th / 2) * TILE - midY) ? b : best))
    const y = (bridge.ty + bridge.th / 2) * TILE + 2
    const west = { x: (bridge.tx - 1) * TILE, y }
    const east = { x: (bridge.tx + bridge.tw + 1) * TILE, y }
    route.push(...(eastOfRiver(layout, start.x) ? [east, west] : [west, east]))
  }

  if (toField && !fromField) route.push(gateOutside, gateInside)
  route.push(to)
  return route
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
