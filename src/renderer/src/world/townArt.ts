// Town pieces: cliff, river, bridges, plaza, and the buildings Junimos visit.
// Same rules as art.ts: 16 px per tile, light from the top left.

import { canopy, groundShadow, INK, LEAF_INK, planks, roof, TILE, window, WOOD } from './art'
import { hex, Pix, rng, shade, type Rgba } from './pixel'

const STONE = { hi: hex('#d8d4ca'), light: hex('#bcb7ab'), mid: hex('#9e998e'), dark: hex('#7a756b'), deep: hex('#58544c') }
const WATER = { deep: hex('#2f6fc4'), mid: hex('#3d8be0'), light: hex('#6fb4f0'), foam: hex('#dff2ff') }

// ---------------------------------------------------------------------------
// Ground pieces (painted into the ground layer)

/** A rock wall along the top of the map, `rows` tiles tall. */
export function paintCliff(p: Pix, rows: number, seed: number): void {
  const r = rng(seed)
  const h = rows * TILE
  const browns = [hex('#7a5a3c'), hex('#6c4e32'), hex('#866444'), hex('#5e432a')]
  let x = 0
  while (x < p.w) {
    const w = 10 + Math.floor(r() * 8)
    const base = browns[Math.floor(r() * browns.length)]
    for (let i = 0; i < w && x + i < p.w; i++) {
      for (let y = 0; y < h; y++) {
        let c = base
        if (i === 0) c = shade(base, -0.35)
        else if (i === 1) c = shade(base, 0.12)
        else if (y % 9 === 0 && i > 2) c = shade(base, -0.15)
        if (r() < 0.04) c = shade(c, r() < 0.5 ? -0.1 : 0.08)
        p.set(x + i, y, c)
      }
    }
    x += w
  }
  // A grassy lip on top and a shadow where the wall meets the ground.
  for (let x2 = 0; x2 < p.w; x2++) {
    p.set(x2, 0, hex('#4a842c'))
    if (r() < 0.6) p.set(x2, 1, hex('#5a9a36'))
    p.set(x2, h - 1, hex('#3e2a18'))
    p.set(x2, h, [20, 30, 10, 90])
    p.set(x2, h + 1, [20, 30, 10, 50])
  }
}

/** A river running down the map from the cliff, with stone banks and a waterfall. */
export function paintRiver(p: Pix, tx: number, tw: number, cliffRows: number, seed: number): void {
  const r = rng(seed)
  const x0 = tx * TILE
  const x1 = (tx + tw) * TILE
  const fall = cliffRows * TILE
  for (let y = 0; y < p.h; y++) {
    for (let x = x0; x < x1; x++) {
      const edge = Math.min(x - x0, x1 - 1 - x)
      if (edge < 3) {
        // Cobbled banks.
        const c = (x + Math.floor(y / 3)) % 3 === 0 ? STONE.dark : edge === 2 ? STONE.light : STONE.mid
        p.set(x, y, edge === 0 ? STONE.deep : c)
        continue
      }
      if (y < fall) {
        // Waterfall: bright vertical streaks.
        const streak = (x * 7 + Math.floor((y + x * 3) / 4)) % 5
        p.set(x, y, streak === 0 ? WATER.foam : streak < 3 ? WATER.light : WATER.mid)
        continue
      }
      let c = edge === 3 ? WATER.deep : WATER.mid
      if (y < fall + 6 && r() < 0.5) c = WATER.foam
      p.set(x, y, c)
    }
  }
  // Ripples.
  for (let i = 0; i < (tw * p.h) / 10; i++) {
    const x = x0 + 5 + Math.floor(r() * (x1 - x0 - 10))
    const y = fall + 8 + Math.floor(r() * (p.h - fall - 8))
    p.hline(x, y, 3, WATER.light)
    p.set(x + 1, y - 1, WATER.foam)
  }
}

/** A wooden bridge across the river, planks running north–south. */
export function paintBridge(p: Pix, tx: number, ty: number, tw: number, th: number): void {
  const x0 = tx * TILE - 4
  const x1 = (tx + tw) * TILE + 4
  const y0 = ty * TILE + 2
  const y1 = (ty + th) * TILE - 2
  for (let x = x0; x < x1; x++) {
    const board = Math.floor((x - x0) / 4)
    for (let y = y0; y < y1; y++) {
      p.set(x, y, (x - x0) % 4 === 3 ? WOOD.dark : board % 2 ? WOOD.light : WOOD.mid)
    }
  }
  for (const y of [y0, y1 - 3]) {
    p.rect(x0, y, x1 - x0, 3, WOOD.dark)
    p.hline(x0, y, x1 - x0, WOOD.hi)
    p.hline(x0, y + 3, x1 - x0, INK)
  }
  for (const x of [x0, x1 - 3]) {
    for (const y of [y0 - 3, y1 - 4]) {
      p.rect(x, y, 4, 6, INK)
      p.rect(x + 1, y + 1, 2, 4, WOOD.mid)
      p.set(x + 1, y + 1, WOOD.hi)
    }
  }
}

/** Paved stone square. */
export function paintPlaza(p: Pix, tx: number, ty: number, tw: number, th: number, seed: number): void {
  const r = rng(seed)
  const x0 = tx * TILE
  const y0 = ty * TILE
  const w = tw * TILE
  const h = th * TILE
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const row = Math.floor((y - y0) / 8)
      const col = Math.floor((x - x0 + (row % 2) * 4) / 8)
      const seam = (y - y0) % 8 === 7 || (x - x0 + (row % 2) * 4) % 8 === 7
      const border = x - x0 < 3 || x0 + w - x <= 3 || y - y0 < 3 || y0 + h - y <= 3
      let c = seam ? STONE.dark : (row + col) % 3 === 0 ? STONE.hi : STONE.light
      if (border) c = seam ? STONE.deep : STONE.mid
      if (r() < 0.03) c = shade(c, -0.08)
      p.set(x, y, c)
    }
  }
}

// ---------------------------------------------------------------------------
// Standing pieces

export function fountain(): Pix {
  const p = new Pix(44, 34)
  p.ellipse(22, 22, 20, 10, STONE.dark)
  p.ellipse(22, 21, 19, 9, STONE.light)
  p.ellipse(22, 21, 15, 6.5, WATER.mid)
  p.ellipse(19, 19, 7, 2.5, WATER.light)
  // Pillar and spout.
  p.rect(20, 8, 5, 13, STONE.light)
  p.vline(24, 8, 13, STONE.dark)
  p.rect(18, 6, 9, 3, STONE.hi)
  for (const [x, y] of [
    [22, 1],
    [21, 2],
    [23, 2],
    [22, 3],
    [20, 4],
    [24, 4],
    [18, 6],
    [26, 6]
  ]) {
    p.set(x, y, WATER.foam)
  }
  p.set(22, 4, WATER.light)
  p.outline(INK)
  groundShadow(p, 22, 31, 18, 2.5)
  return p
}

/** The community center: where Junimos wait for you (needs input, subagents). */
export function communityCenter(): Pix {
  const p = new Pix(116, 96)
  planks(p, 10, 46, 96, 38, hex('#e2b47c'), hex('#d0a06a'), hex('#9a6a3e'), 61)
  p.hline(10, 46, 96, hex('#7a4a22'))
  roof(p, 14, 48, [22, 93], [4, 111], hex('#c0503e'), 62)
  // Gable with a clock.
  p.ellipse(58, 26, 10, 10, INK)
  p.ellipse(58, 26, 9, 9, hex('#fff8e0'))
  p.vline(58, 19, 8, INK)
  p.hline(58, 26, 6, INK)
  for (const [x, y] of [
    [58, 18],
    [66, 26],
    [58, 34],
    [50, 26]
  ]) {
    p.set(x, y, hex('#c0503e'))
  }
  window(p, 18, 56, 14, 11)
  window(p, 38, 56, 12, 11)
  window(p, 66, 56, 12, 11)
  window(p, 84, 56, 14, 11)
  // Double door.
  p.rect(51, 58, 15, 26, INK)
  p.rect(52, 59, 13, 25, hex('#7a4a22'))
  p.vline(58, 59, 25, INK)
  p.set(56, 72, hex('#ffd84a'))
  p.set(60, 72, hex('#ffd84a'))
  // Foundation and steps.
  for (let x = 10; x < 106; x++) {
    p.set(x, 84, x % 7 === 0 ? STONE.dark : STONE.light)
    p.set(x, 85, STONE.mid)
  }
  p.rect(44, 86, 29, 3, STONE.hi)
  p.rect(41, 89, 35, 3, STONE.light)
  p.outline(INK)
  groundShadow(p, 58, 92, 54, 4)
  return p
}

/** The blacksmith: Junimos running shell commands work at the forge. */
export function blacksmith(): Pix {
  const p = new Pix(88, 80)
  // Stone walls.
  for (let y = 36; y < 70; y++) {
    for (let x = 6; x < 82; x++) {
      const row = Math.floor((y - 36) / 6)
      const seam = (y - 36) % 6 === 5 || (x + (row % 2) * 5) % 10 === 0
      p.set(x, y, seam ? STONE.deep : shade(STONE.mid, ((x * 3 + y * 7) % 5) * 0.03 - 0.06))
    }
  }
  roof(p, 8, 38, [16, 71], [2, 85], hex('#6a4a3a'), 71)
  // Chimney.
  p.rect(64, 0, 10, 18, STONE.dark)
  p.rect(63, 0, 12, 3, STONE.deep)
  // Forge window glowing orange, and the door.
  p.rect(14, 46, 22, 16, INK)
  p.rect(15, 47, 20, 14, hex('#3a1a0a'))
  p.ellipse(25, 58, 8, 5, hex('#ff8a2a'))
  p.ellipse(25, 59, 5, 3, hex('#ffd84a'))
  p.rect(52, 44, 16, 26, INK)
  p.rect(53, 45, 14, 25, hex('#5a3418'))
  for (let y = 48; y < 70; y += 5) p.hline(53, y, 14, hex('#3a2010'))
  p.set(64, 57, hex('#d8d8e0'))
  // Anvil outside.
  p.rect(70, 66, 12, 3, hex('#4a4a52'))
  p.rect(72, 69, 8, 4, hex('#3a3a42'))
  p.rect(74, 73, 4, 3, hex('#4a4a52'))
  p.hline(70, 66, 12, hex('#8a8a96'))
  p.outline(INK)
  groundShadow(p, 44, 76, 40, 3.5)
  return p
}

/** The Junimo hut: sessions that finished their turn rest here. */
export function junimoHut(): Pix {
  const p = new Pix(52, 50)
  // Round stone base.
  for (let y = 26; y < 44; y++) {
    for (let x = 8; x < 44; x++) {
      const seam = (y - 26) % 5 === 4 || (x + Math.floor((y - 26) / 5) * 4) % 8 === 0
      p.set(x, y, seam ? STONE.dark : STONE.light)
    }
  }
  // Leafy dome roof.
  canopy(
    p,
    [
      [26, 20, 23, 15],
      [12, 26, 9, 6],
      [40, 26, 9, 6]
    ],
    83
  )
  // Little round door.
  p.ellipse(26, 37, 6, 7, INK)
  p.ellipse(26, 37, 5, 6, hex('#7a4a22'))
  p.rect(20, 37, 13, 7, hex('#7a4a22'))
  p.rect(19, 37, 1, 7, INK)
  p.rect(33, 37, 1, 7, INK)
  p.set(29, 39, hex('#ffd84a'))
  p.outline(LEAF_INK)
  groundShadow(p, 26, 46, 22, 3)
  return p
}

/** The mine: a timber-framed tunnel in the cliff. Searching Junimos dig here. */
export function mineEntrance(): Pix {
  const p = new Pix(52, 50)
  // Dark tunnel.
  p.ellipse(26, 26, 17, 18, hex('#120c08'))
  p.rect(9, 26, 35, 20, hex('#120c08'))
  p.ellipse(26, 30, 11, 12, hex('#241810'))
  // Timber frame.
  for (const x of [6, 41]) {
    p.rect(x, 12, 6, 36, WOOD.mid)
    p.vline(x, 12, 36, WOOD.dark)
    p.vline(x + 5, 12, 36, WOOD.deep)
  }
  p.rect(2, 8, 48, 7, WOOD.mid)
  p.hline(2, 8, 48, WOOD.hi)
  p.hline(2, 14, 48, WOOD.deep)
  // Rails coming out.
  for (let y = 36; y < 50; y += 3) p.hline(16, y, 20, WOOD.dark)
  p.vline(19, 34, 16, hex('#8a8a96'))
  p.vline(32, 34, 16, hex('#8a8a96'))
  // Lantern.
  p.rect(44, 18, 5, 6, INK)
  p.rect(45, 19, 3, 4, hex('#ffd84a'))
  p.outline(INK)
  return p
}

export function lampPost(): Pix {
  const p = new Pix(10, 32)
  p.rect(4, 9, 2, 20, hex('#3a3a42'))
  p.rect(3, 28, 4, 3, hex('#3a3a42'))
  p.rect(2, 2, 6, 7, hex('#3a3a42'))
  p.rect(3, 3, 4, 5, hex('#ffe27a'))
  p.set(3, 3, hex('#fff8d0'))
  p.rect(3, 0, 4, 2, hex('#3a3a42'))
  p.outline(INK)
  groundShadow(p, 5, 30, 3, 1)
  return p
}

const AUTUMN: Record<'orange' | 'yellow' | 'green', readonly Rgba[]> = {
  orange: ['#ffc070', '#f0903a', '#d8692a', '#b04a22', '#7e321a'].map((c) => hex(c)),
  yellow: ['#fff0a0', '#f8d050', '#e0b030', '#b88a22', '#86621a'].map((c) => hex(c)),
  green: ['#9ad85e', '#74bd45', '#57a035', '#3f822b', '#2e6522'].map((c) => hex(c))
}

/** A round tree in an autumn colour. */
export function roundTree(seed: number, colour: keyof typeof AUTUMN): Pix {
  const p = new Pix(40, 52)
  p.rect(17, 30, 6, 17, WOOD.mid)
  p.vline(17, 30, 17, WOOD.dark)
  p.vline(22, 30, 17, WOOD.light)
  p.rect(15, 44, 10, 3, WOOD.mid)
  canopy(
    p,
    [
      [20, 19, 16, 13],
      [11, 24, 8, 7],
      [29, 24, 8, 7],
      [15, 11, 8, 7],
      [26, 11, 8, 7]
    ],
    seed,
    AUTUMN[colour]
  )
  p.outline(shade(AUTUMN[colour][4], -0.4))
  groundShadow(p, 21, 47, 14, 3.5)
  return p
}

/** A pine tree: stacked triangles of dark green. */
export function pineTree(seed: number): Pix {
  const p = new Pix(32, 50)
  const greens = ['#5a9a4a', '#3f7f3a', '#2e6530', '#1f4a24'].map((c) => hex(c))
  const r = rng(seed)
  p.rect(14, 38, 4, 8, WOOD.mid)
  p.vline(14, 38, 8, WOOD.dark)
  for (const [top, bottom, half] of [
    [22, 40, 14],
    [11, 30, 11],
    [1, 19, 7]
  ] as const) {
    for (let y = top; y <= bottom; y++) {
      const w = Math.round(((y - top) / (bottom - top)) * half)
      for (let x = 16 - w; x <= 16 + w; x++) {
        const light = (16 - x) / (w + 1) - (y - top) / (bottom - top) + (r() - 0.5) * 0.3
        p.set(x, y, light > 0.4 ? greens[0] : light > -0.2 ? greens[1] : light > -0.7 ? greens[2] : greens[3])
      }
    }
  }
  p.outline(hex('#14301a'))
  groundShadow(p, 17, 46, 11, 2.5)
  return p
}

export function mushroom(seed: number): Pix {
  const p = new Pix(10, 10)
  const red = seed % 2 === 0
  p.rect(4, 5, 2, 4, hex('#f4e4c8'))
  p.ellipse(5, 4, 4.5, 3, red ? hex('#d83a2a') : hex('#c88a4a'))
  p.set(3, 3, hex('#ffffff'))
  p.set(6, 2, hex('#ffffff'))
  p.set(7, 4, hex('#ffffff'))
  p.outline(INK)
  return p
}

// ---------------------------------------------------------------------------
// Junimos: one per session, coloured by session.

export const JUNIMO_COLOURS = ['#7cd858', '#f6c040', '#5ab4f0', '#f088b8', '#f08a4a', '#b08af0', '#f4f0e0', '#58d8c0'] as const

/** 14×15 Junimo. Frame 1 is squashed for a little hop. */
export function junimo(colour: string, frame: 0 | 1): Pix {
  const p = new Pix(14, 15)
  const body = hex(colour)
  const squash = frame === 1 ? 1 : 0
  p.ellipse(7, 9 + squash, 5.5, 4.6 - squash * 0.6, (_x, _y, dx, dy) => (dx + dy < -0.7 ? shade(body, 0.35) : dx + dy > 0.8 ? shade(body, -0.25) : body))
  // Leaf sprout.
  p.vline(7, 2 + squash, 3, hex('#3f822b'))
  p.set(6, 2 + squash, hex('#74bd45'))
  p.set(5, 1 + squash, hex('#74bd45'))
  p.set(8, 3 + squash, hex('#57a035'))
  p.set(9, 2 + squash, hex('#57a035'))
  // Eyes and feet.
  p.set(5, 9 + squash, INK)
  p.set(9, 9 + squash, INK)
  p.set(4, 14, shade(body, -0.3))
  p.set(10, 14, shade(body, -0.3))
  p.outline(shade(body, -0.65))
  return p
}
