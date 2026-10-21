// Where each session's Junimo goes and what it shows over its head.
// Pure functions so the rules are easy to test and to explain (docs/DESIGN.md §3).

import type { SpriteName } from '../../../shared/sprites'
import type { Plot } from '../../../shared/types'
import { bedRect, type Place, type WorldLayout } from './layout'
import { JUNIMO_COLOURS } from './townArt'

export type Destination = Place | 'plot'

/** Claude asked something and is waiting for an answer (not just a finished turn). */
function asking(plot: Plot): boolean {
  return plot.state === 'thirsty' && plot.note !== null
}

export function junimoDestination(plot: Plot): Destination {
  switch (plot.state) {
    case 'pest':
    case 'withered':
      return 'plaza'
    case 'ripe':
      return 'bin'
    case 'dormant':
    case 'seeded':
      return 'hut'
    case 'thirsty':
      return asking(plot) ? 'plaza' : 'hut'
    case 'growing':
      switch (plot.activity) {
        case 'command':
          return 'blacksmith'
        case 'read':
          return 'museum'
        case 'search':
          return 'mine'
        case 'delegate':
          return 'plaza'
        default:
          return 'plot'
      }
  }
}

export function junimoBubble(plot: Plot): SpriteName | null {
  switch (plot.state) {
    case 'pest':
      return 'exclaim'
    case 'withered':
      return 'cross'
    case 'ripe':
      return 'star'
    case 'dormant':
      return 'zzz'
    case 'seeded':
    case 'thirsty':
      return asking(plot) ? 'exclaim' : 'drop'
    case 'growing':
      switch (plot.activity) {
        case 'edit':
          return 'leaf'
        case 'command':
          return 'fire'
        case 'read':
          return 'book'
        case 'search':
          return 'pick'
        case 'delegate':
          return 'scroll'
        default:
          return null
      }
  }
}

/** Stable colour per session. */
export function junimoColour(plotId: string): string {
  let h = 0
  for (let i = 0; i < plotId.length; i++) h = (h * 31 + plotId.charCodeAt(i)) >>> 0
  return JUNIMO_COLOURS[h % JUNIMO_COLOURS.length]
}

/** Junimos per row when several gather at one place (wide enough for their name tags). */
const CROWD_COLS = 3

/**
 * Feet position for every Junimo. Junimos at the same place stand in a little
 * crowd (rows of three) so they don't overlap; at its own plot a Junimo stands on
 * the bed.
 */
export function junimoTargets(layout: WorldLayout, plots: readonly Plot[]): Map<string, { x: number; y: number }> {
  const targets = new Map<string, { x: number; y: number }>()
  const crowds = new Map<Place, Plot[]>()
  for (const plot of [...plots].sort((a, b) => a.slot - b.slot)) {
    const dest = junimoDestination(plot)
    if (dest === 'plot') {
      const bed = bedRect(layout, plot.slot)
      targets.set(plot.id, { x: bed.x + 9, y: bed.y + bed.h - 2 })
    } else {
      crowds.set(dest, [...(crowds.get(dest) ?? []), plot])
    }
  }
  for (const [place, members] of crowds) {
    const anchor = layout.places[place]
    members.forEach((plot, i) => {
      const col = i % CROWD_COLS
      const row = Math.floor(i / CROWD_COLS)
      const dx = (col - (CROWD_COLS - 1) / 2) * 30 + (row % 2) * 15
      targets.set(plot.id, { x: Math.round(anchor.x + dx), y: anchor.y + row * 22 })
    })
  }
  return targets
}
