// Original pixel art for the farm world, painted in code at 16 px per tile.
// Light comes from the top left; objects get a dark outline and a soft shadow,
// in the spirit of a 3/4 top-down farming game.

import { hex, Pix, rng, shade, type Rgba } from './pixel'

export const TILE = 16

const INK = hex('#2b1a0e')
const SHADOW: Rgba = [20, 30, 10, 70]

const WOOD = { hi: hex('#e6b47a'), light: hex('#d39a5e'), mid: hex('#b0763c'), dark: hex('#7a4a22'), deep: hex('#5a3418') }
const GRASS = { hi: hex('#9ad35e'), light: hex('#80c24f'), mid: hex('#6db042'), dark: hex('#5a9a36'), deep: hex('#4a842c') }
const DIRT = { light: hex('#e2c08a'), mid: hex('#d2aa72'), dark: hex('#b88c58') }
const LEAF = [hex('#9ad85e'), hex('#74bd45'), hex('#57a035'), hex('#3f822b'), hex('#2e6522')]
const LEAF_INK = hex('#1d3f16')

function groundShadow(p: Pix, cx: number, cy: number, rx: number, ry: number): void {
  p.ellipse(cx, cy, rx, ry, (x, y) => (p.opaque(x, y) ? null : SHADOW))
}

// ---------------------------------------------------------------------------
// Ground

/** Grass for a whole map, with per-pixel variation so tiles never repeat. */
export function paintGrass(p: Pix, seed: number): void {
  const r = rng(seed)
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const n = r()
      p.set(x, y, n < 0.08 ? GRASS.dark : n < 0.13 ? GRASS.light : GRASS.mid)
    }
  }
  // Little tufts: a dark base with a light tip.
  const tufts = Math.floor((p.w * p.h) / 70)
  for (let i = 0; i < tufts; i++) {
    const x = Math.floor(r() * p.w)
    const y = Math.floor(r() * p.h)
    p.set(x, y, GRASS.deep)
    p.set(x - 1, y - 1, GRASS.dark)
    p.set(x + 1, y - 1, GRASS.dark)
    p.set(x, y - 1, GRASS.hi)
  }
}

/** A dirt path over a rectangle of tiles, with ragged grass edges. */
export function paintPath(p: Pix, tx: number, ty: number, tw: number, th: number, seed: number): void {
  const r = rng(seed)
  const x0 = tx * TILE
  const y0 = ty * TILE
  const w = tw * TILE
  const h = th * TILE
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const edge = Math.min(x - x0, x0 + w - 1 - x, y - y0, y0 + h - 1 - y)
      if (edge < 2 && r() < 0.5 - edge * 0.2) continue
      const n = r()
      p.set(x, y, n < 0.1 ? DIRT.dark : n < 0.18 ? DIRT.light : DIRT.mid)
    }
  }
  // Pebbles.
  for (let i = 0; i < (tw * th) / 2; i++) {
    const x = x0 + 2 + Math.floor(r() * (w - 4))
    const y = y0 + 2 + Math.floor(r() * (h - 4))
    p.set(x, y, DIRT.dark)
    p.set(x, y - 1, DIRT.light)
  }
}

/** Scatter flowers and small stones on grass (never inside `avoid`). */
export function paintDecor(p: Pix, seed: number, count: number, avoid: (x: number, y: number) => boolean): void {
  const r = rng(seed)
  const petals = ['#ffffff', '#ffd84a', '#ff8a7a', '#c8a0ff'].map((c) => hex(c))
  for (let i = 0; i < count; i++) {
    const x = 2 + Math.floor(r() * (p.w - 4))
    const y = 2 + Math.floor(r() * (p.h - 4))
    if (avoid(x, y)) continue
    if (r() < 0.75) {
      const c = petals[Math.floor(r() * petals.length)]
      p.set(x, y + 1, GRASS.deep)
      p.set(x - 1, y, c)
      p.set(x + 1, y, c)
      p.set(x, y - 1, c)
      p.set(x, y, hex('#f6c040'))
    } else {
      p.set(x, y, hex('#9a948a'))
      p.set(x + 1, y, hex('#7a746a'))
      p.set(x, y - 1, hex('#c8c2b6'))
    }
  }
}

/** The fence around the field, painted straight onto the ground. Gate in the top side. */
export function paintFence(p: Pix, tx: number, ty: number, tw: number, th: number, gate: { from: number; to: number }): void {
  const left = tx * TILE + 4
  const right = (tx + tw) * TILE - 5
  const top = ty * TILE + 6
  const bottom = (ty + th) * TILE - 6
  const rail = (x0: number, x1: number, y: number): void => {
    for (let x = x0; x <= x1; x++) {
      p.set(x, y - 1, INK)
      p.set(x, y, WOOD.light)
      p.set(x, y + 1, WOOD.mid)
      p.set(x, y + 2, INK)
    }
  }
  const post = (x: number, y: number): void => {
    p.rect(x - 2, y - 7, 5, 10, INK)
    p.rect(x - 1, y - 6, 3, 8, WOOD.mid)
    p.rect(x - 1, y - 6, 3, 2, WOOD.hi)
    p.vline(x + 1, y - 4, 6, WOOD.dark)
    groundShadow(p, x + 2, y + 3, 3, 1.5)
  }
  const gateStart = (tx + gate.from) * TILE
  const gateEnd = (tx + gate.to) * TILE
  // Top and bottom rails.
  for (const y of [top, bottom]) {
    for (const [x0, x1] of y === top ? [[left, gateStart], [gateEnd, right]] : [[left, right]]) {
      rail(x0, x1, y - 4)
      rail(x0, x1, y)
    }
  }
  // Side rails (seen end-on, so a single board).
  for (const x of [left, right]) {
    for (let y = top; y <= bottom; y++) {
      p.set(x - 1, y, INK)
      p.set(x, y, WOOD.mid)
      p.set(x + 1, y, INK)
    }
  }
  for (let x = left; x <= right; x += TILE) {
    if (x > gateStart - 2 && x < gateEnd + 2) continue
    post(x, top)
    post(x, bottom)
  }
  for (let y = top; y <= bottom; y += TILE) {
    post(left, y)
    post(right, y)
  }
  post(gateStart, top)
  post(gateEnd, top)
  post(right, bottom)
}

// ---------------------------------------------------------------------------
// Plots

/** A tilled bed of soil, `tw`×`th` tiles, with a front edge for depth. */
export function soilBed(tw: number, th: number, wet: boolean, seed: number): Pix {
  const w = tw * TILE
  const h = th * TILE
  const p = new Pix(w, h + 3)
  const c = wet
    ? { ridge: hex('#86562e'), base: hex('#6a4224'), furrow: hex('#4a2c14'), edge: hex('#38200e') }
    : { ridge: hex('#b8854f'), base: hex('#9a6a3c'), furrow: hex('#6e4626'), edge: hex('#553519') }
  const r = rng(seed)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const row = y % 6
      let col = row === 0 ? c.ridge : row >= 4 ? c.furrow : c.base
      if (r() < 0.06) col = shade(col, r() < 0.5 ? -0.12 : 0.1)
      p.set(x, y, col)
    }
  }
  p.rect(0, h, w, 3, c.edge)
  // Round the corners.
  for (const [x, y] of [
    [0, 0],
    [w - 1, 0],
    [0, h + 2],
    [w - 1, h + 2]
  ]) {
    const i = (y * w + x) * 4
    p.data[i + 3] = 0
  }
  return p.outline(hex('#3a2210'))
}

/** Unused ground waiting to be tilled: a few pegs and a string, plus a seed bag sign. */
export function emptyBed(tw: number, th: number): Pix {
  const w = tw * TILE
  const h = th * TILE
  const p = new Pix(w + 2, h + 4)
  const string = hex('#f4e4bc', 200)
  for (let x = 2; x < w - 1; x += 2) {
    p.set(x, 2, string)
    p.set(x, h - 1, string)
  }
  for (let y = 2; y < h; y += 2) {
    p.set(2, y, string)
    p.set(w - 2, y, string)
  }
  for (const [x, y] of [
    [2, 2],
    [w - 2, 2],
    [2, h - 1],
    [w - 2, h - 1]
  ]) {
    p.rect(x - 1, y - 3, 2, 4, WOOD.mid)
    p.set(x - 1, y - 3, WOOD.hi)
  }
  return p
}

// ---------------------------------------------------------------------------
// Nature

function canopy(p: Pix, blobs: Array<[number, number, number, number]>, seed: number): void {
  const r = rng(seed)
  for (const [cx, cy, rx, ry] of blobs) {
    p.ellipse(cx, cy, rx, ry, (_x, _y, dx, dy) => {
      // Light from the top left; a little noise for leaves.
      const light = -dx * 0.55 - dy * 0.8 + (r() - 0.5) * 0.35
      const i = light > 0.75 ? 0 : light > 0.25 ? 1 : light > -0.25 ? 2 : light > -0.7 ? 3 : 4
      return LEAF[i]
    })
  }
}

export function tree(seed: number): Pix {
  const p = new Pix(48, 62)
  // Trunk with bark.
  p.rect(20, 36, 8, 21, WOOD.mid)
  p.vline(20, 36, 21, WOOD.dark)
  p.vline(21, 36, 21, WOOD.dark)
  p.vline(26, 36, 21, WOOD.light)
  p.rect(18, 54, 12, 3, WOOD.mid)
  p.hline(18, 56, 12, WOOD.dark)
  for (let y = 40; y < 54; y += 4) p.set(23 + (y % 3), y, WOOD.deep)
  canopy(
    p,
    [
      [24, 24, 19, 16],
      [13, 30, 10, 9],
      [35, 30, 10, 9],
      [18, 13, 10, 9],
      [31, 13, 10, 9]
    ],
    seed
  )
  p.outline(LEAF_INK)
  groundShadow(p, 25, 57, 17, 4)
  return p
}

export function bush(seed: number): Pix {
  const p = new Pix(28, 22)
  canopy(
    p,
    [
      [14, 11, 11, 8],
      [8, 13, 6, 6],
      [20, 13, 6, 6]
    ],
    seed
  )
  const r = rng(seed + 1)
  for (let i = 0; i < 4; i++) {
    const x = 6 + Math.floor(r() * 16)
    const y = 7 + Math.floor(r() * 8)
    p.set(x, y, hex('#d83a5a'))
    p.set(x, y - 1, hex('#ff8aa0'))
  }
  p.outline(LEAF_INK)
  groundShadow(p, 14, 19, 12, 2.5)
  return p
}

// ---------------------------------------------------------------------------
// Buildings and props

function planks(p: Pix, x: number, y: number, w: number, h: number, light: Rgba, dark: Rgba, seam: Rgba, seed: number): void {
  const r = rng(seed)
  for (let j = 0; j < h; j++) {
    const row = Math.floor(j / 4)
    for (let i = 0; i < w; i++) {
      let c = j % 4 === 3 ? seam : (row + Math.floor((i + row * 7) / 16)) % 2 ? light : dark
      if (r() < 0.04) c = shade(c, -0.08)
      p.set(x + i, y + j, c)
    }
    // Staggered board ends.
    if (j % 4 !== 3) {
      const offset = (Math.floor(j / 4) * 11) % 24
      for (let i = offset; i < w; i += 24) p.set(x + i, y + j, seam)
    }
  }
}

function window(p: Pix, x: number, y: number, w: number, h: number): void {
  p.rect(x - 1, y - 1, w + 2, h + 2, INK)
  p.rect(x, y, w, h, WOOD.light)
  p.rect(x + 1, y + 1, w - 2, h - 2, hex('#7ec4ee'))
  // Reflection.
  for (let i = 0; i < Math.min(w, h) - 3; i++) p.set(x + 2 + i, y + h - 3 - i, hex('#d8f2ff'))
  p.vline(x + Math.floor(w / 2), y + 1, h - 2, WOOD.mid)
  p.hline(x + 1, y + Math.floor(h / 2), w - 2, WOOD.mid)
  // Flower box.
  p.rect(x - 1, y + h + 1, w + 2, 3, WOOD.dark)
  for (let i = 0; i < w; i += 3) {
    p.set(x + i, y + h, hex('#57a035'))
    p.set(x + i + 1, y + h - 1, i % 2 ? hex('#ff8a7a') : hex('#ffd84a'))
  }
}

/** Roof seen from the front at 3/4: a trapezoid of shingle rows. */
function roof(p: Pix, top: number, bottom: number, xTop: [number, number], xBottom: [number, number], colour: Rgba, seed: number): void {
  const r = rng(seed)
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / (bottom - top)
    const x0 = Math.round(xTop[0] + (xBottom[0] - xTop[0]) * t)
    const x1 = Math.round(xTop[1] + (xBottom[1] - xTop[1]) * t)
    const row = Math.floor((y - top) / 4)
    for (let x = x0; x <= x1; x++) {
      let c = (y - top) % 4 === 3 ? shade(colour, -0.3) : shade(colour, (row % 2 ? -0.05 : 0.05) - t * 0.15)
      if ((x + row * 3) % 8 === 0 && (y - top) % 4 !== 3) c = shade(colour, -0.25)
      if (r() < 0.03) c = shade(c, 0.1)
      p.set(x, y, c)
    }
  }
  // Ridge highlight and the shadow of the eaves.
  p.hline(xTop[0], top, xTop[1] - xTop[0] + 1, shade(colour, 0.35))
  p.hline(xBottom[0], bottom, xBottom[1] - xBottom[0] + 1, shade(colour, -0.45))
}

export function farmhouse(): Pix {
  const p = new Pix(84, 86)
  // Chimney behind the roof.
  p.rect(58, 2, 9, 16, hex('#9a4a3a'))
  p.rect(57, 0, 11, 3, hex('#7a3a2a'))
  for (let y = 4; y < 18; y += 3) p.hline(58, y, 9, hex('#7a3a2a'))
  // Walls.
  planks(p, 7, 42, 70, 34, hex('#e8c28c'), hex('#d8ae74'), hex('#a8784a'), 3)
  p.hline(7, 42, 70, hex('#8a5a32'))
  p.hline(7, 43, 70, hex('#a8784a'))
  // Stone foundation.
  for (let x = 7; x < 77; x++) {
    p.set(x, 76, (x % 6 === 0 ? hex('#7a746a') : hex('#b8b2a6')))
    p.set(x, 77, hex('#9a948a'))
    p.set(x, 78, hex('#7a746a'))
  }
  roof(p, 8, 44, [16, 67], [2, 81], hex('#c0503e'), 9)
  window(p, 14, 52, 14, 11)
  window(p, 56, 52, 14, 11)
  // Door.
  p.rect(35, 52, 14, 25, INK)
  p.rect(36, 53, 12, 24, hex('#7a4a22'))
  for (let x = 38; x < 48; x += 3) p.vline(x, 54, 22, hex('#6a3c1a'))
  p.set(45, 65, hex('#ffd84a'))
  p.set(45, 66, hex('#b8903a'))
  // Step.
  p.rect(31, 78, 22, 4, hex('#c8c2b6'))
  p.hline(31, 78, 22, hex('#e0dad0'))
  p.outline(INK)
  groundShadow(p, 42, 82, 40, 4)
  return p
}

export function library(): Pix {
  const p = new Pix(84, 84)
  const stone = hex('#b8b2a6')
  const mortar = hex('#8a847a')
  // Brick walls.
  for (let y = 40; y < 76; y++) {
    for (let x = 6; x < 78; x++) {
      const row = Math.floor((y - 40) / 5)
      const seam = (y - 40) % 5 === 4 || (x + (row % 2) * 6) % 12 === 0
      p.set(x, y, seam ? mortar : shade(stone, ((x * 7 + y * 13) % 5) * 0.02 - 0.04))
    }
  }
  roof(p, 10, 42, [14, 69], [1, 82], hex('#3f8a96'), 21)
  // Columns and the big door.
  for (const x of [22, 58]) {
    p.rect(x, 44, 5, 32, hex('#f0ece0'))
    p.vline(x + 4, 44, 32, hex('#c8c2b6'))
    p.rect(x - 1, 44, 7, 2, hex('#ffffff'))
    p.rect(x - 1, 74, 7, 2, hex('#c8c2b6'))
  }
  p.rect(34, 50, 16, 26, INK)
  p.rect(35, 51, 14, 25, hex('#5a3418'))
  p.vline(42, 51, 25, INK)
  p.ellipse(42, 51, 7, 4, hex('#5a3418'))
  p.set(40, 63, hex('#ffd84a'))
  p.set(44, 63, hex('#ffd84a'))
  // Round window above the door.
  p.ellipse(42, 32, 5, 5, INK)
  p.ellipse(42, 32, 4, 4, hex('#ffe9a8'))
  p.hline(38, 32, 9, hex('#c8a060'))
  p.vline(42, 28, 9, hex('#c8a060'))
  // Steps.
  p.rect(28, 76, 28, 3, hex('#d8d2c6'))
  p.rect(30, 79, 24, 2, hex('#b8b2a6'))
  p.outline(INK)
  groundShadow(p, 42, 80, 40, 4)
  return p
}

export function shippingBin(): Pix {
  const p = new Pix(32, 26)
  // Lid (top face, lighter) and front face.
  planks(p, 2, 3, 28, 8, WOOD.hi, WOOD.light, WOOD.mid, 31)
  p.hline(2, 10, 28, WOOD.dark)
  for (let x = 2; x < 30; x++) for (let y = 11; y < 22; y++) p.set(x, y, (x - 2) % 7 === 6 ? WOOD.deep : y < 13 ? WOOD.dark : WOOD.mid)
  // Iron bands.
  for (const x of [5, 24]) p.rect(x, 3, 2, 19, hex('#6a6a72'))
  p.rect(14, 12, 4, 3, hex('#d8b040'))
  p.outline(INK)
  groundShadow(p, 16, 23, 15, 2.5)
  return p
}

export function mailbox(): Pix {
  const p = new Pix(16, 28)
  p.rect(7, 13, 3, 13, WOOD.mid)
  p.vline(7, 13, 13, WOOD.dark)
  p.rect(2, 4, 12, 10, hex('#c8483a'))
  p.ellipse(8, 5, 6, 3, hex('#c8483a'))
  p.hline(2, 12, 12, hex('#8a2e24'))
  p.vline(3, 4, 8, hex('#e8786a'))
  p.rect(13, 3, 2, 6, hex('#ffd84a'))
  p.outline(INK)
  groundShadow(p, 9, 26, 5, 1.5)
  return p
}

export function bulletinBoard(): Pix {
  const p = new Pix(36, 34)
  for (const x of [5, 29]) {
    p.rect(x, 8, 3, 24, WOOD.mid)
    p.vline(x, 8, 24, WOOD.dark)
  }
  p.rect(2, 6, 32, 18, WOOD.light)
  p.rect(4, 8, 28, 14, hex('#c8935a'))
  p.rect(1, 3, 34, 3, WOOD.dark)
  const notes: Array<[number, number, string]> = [
    [6, 10, '#fff8e0'],
    [16, 9, '#ffe2a8'],
    [24, 12, '#e8f4ff']
  ]
  for (const [x, y, c] of notes) {
    p.rect(x, y, 7, 8, hex(c))
    for (let j = 2; j < 7; j += 2) p.hline(x + 1, y + j, 5, hex('#a8a090'))
    p.set(x + 3, y, hex('#d83a2a'))
  }
  p.outline(INK)
  groundShadow(p, 18, 32, 15, 2)
  return p
}

// ---------------------------------------------------------------------------
// The farmer

export type Facing = 'down' | 'up' | 'side'

/** 16×26 farmer. `step` 0 = standing, 1/2 = walking frames. */
export function farmer(facing: Facing, step: 0 | 1 | 2): Pix {
  const p = new Pix(16, 27)
  const skin = hex('#f2c29a')
  const skinDark = hex('#d89a70')
  const hair = hex('#6b3f1f')
  const shirt = hex('#c84a3a')
  const shirtDark = hex('#9a3428')
  const denim = hex('#3f6fb5')
  const denimDark = hex('#2e5490')
  const boot = hex('#5a3a1e')
  const straw = hex('#e8c060')
  const strawDark = hex('#b8903a')
  const bob = step === 0 ? 0 : 1

  // Legs and boots.
  const legY = 18
  const leftLift = step === 1 ? -1 : 0
  const rightLift = step === 2 ? -1 : 0
  p.rect(5, legY + leftLift, 3, 5, denim)
  p.rect(9, legY + rightLift, 3, 5, denim)
  p.rect(4, legY + 4 + leftLift, 4, 2, boot)
  p.rect(9, legY + 4 + rightLift, 4, 2, boot)
  // Body.
  const by = bob
  p.rect(4, 11 + by, 9, 8, shirt)
  p.rect(2, 12 + by, 2, 5, facing === 'side' ? shirtDark : shirt)
  p.rect(13, 12 + by, 2, 5, shirtDark)
  p.rect(2, 17 + by, 2, 1, skin)
  p.rect(13, 17 + by, 2, 1, skin)
  if (facing !== 'up') {
    p.rect(5, 14 + by, 7, 5, denim)
    p.vline(5, 11 + by, 3, denim)
    p.vline(11, 11 + by, 3, denim)
    p.set(6, 15 + by, hex('#ffd84a'))
    p.set(10, 15 + by, hex('#ffd84a'))
  } else {
    p.rect(5, 15 + by, 7, 4, denimDark)
    p.vline(6, 11 + by, 4, denim)
    p.vline(10, 11 + by, 4, denim)
  }
  // Head.
  const hy = by
  p.rect(4, 5 + hy, 9, 6, facing === 'up' ? hair : skin)
  if (facing === 'down') {
    p.vline(4, 5 + hy, 3, hair)
    p.vline(12, 5 + hy, 3, hair)
    p.set(6, 7 + hy, INK)
    p.set(10, 7 + hy, INK)
    p.set(5, 9 + hy, hex('#f0a090'))
    p.set(11, 9 + hy, hex('#f0a090'))
    p.hline(7, 9 + hy, 3, skinDark)
  } else if (facing === 'side') {
    p.rect(4, 5 + hy, 3, 4, hair)
    p.set(10, 7 + hy, INK)
    p.set(12, 8 + hy, skinDark)
  }
  // Straw hat.
  p.rect(1, 4 + hy, 15, 2, straw)
  p.hline(1, 5 + hy, 15, strawDark)
  p.rect(4, 0 + hy, 9, 4, straw)
  p.hline(4, 3 + hy, 9, hex('#c84a3a'))
  p.vline(12, 0 + hy, 3, strawDark)
  p.outline(INK)
  groundShadow(p, 8.5, 25, 6, 1.5)
  return p
}
