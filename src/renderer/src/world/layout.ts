// Where everything sits in the farm world, in tiles and world pixels, plus the
// camera maths. Pure functions, so they can be unit tested without a canvas.

export const TILE = 16
/** Plots per row in the field. */
export const FIELD_COLS = 4
/** Each slot: a 3×2 tile bed, a row for its sign, and a gap. */
export const SLOT_W = 4
export const SLOT_H = 4
export const BED_W = 3
export const BED_H = 2

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type PropKind = 'farmhouse' | 'library' | 'shippingBin' | 'mailbox' | 'bulletinBoard' | 'tree' | 'bush'

export interface Prop {
  kind: PropKind
  /** Top-left of the sprite in world pixels. */
  x: number
  y: number
  seed: number
}

export interface WorldLayout {
  /** Map size in tiles. */
  cols: number
  rows: number
  field: { tx: number; ty: number; tw: number; th: number; gate: { from: number; to: number } }
  /** Dirt paths, in tiles. */
  paths: Array<{ tx: number; ty: number; tw: number; th: number }>
  props: Prop[]
  /** Number of slots drawn (used + one free to plant). */
  slots: number
}

const FIELD_TX = 9
const FIELD_TY = 12

/** Lay out the farm for plots occupying `usedSlots` (their slot numbers). */
export function layoutWorld(usedSlots: readonly number[]): WorldLayout {
  const highest = usedSlots.length ? Math.max(...usedSlots) : -1
  // Always room for one more plot, and at least two rows so the field looks like a field.
  const slots = Math.max(highest + 2, usedSlots.length + 1, FIELD_COLS * 2)
  const fieldRows = Math.ceil(slots / FIELD_COLS)
  const field = {
    tx: FIELD_TX,
    ty: FIELD_TY,
    tw: FIELD_COLS * SLOT_W + 2,
    th: fieldRows * SLOT_H + 1,
    gate: { from: 7, to: 11 }
  }
  const cols = 42
  const rows = field.ty + field.th + 5

  const paths = [
    { tx: 1, ty: 9, tw: cols - 2, th: 2 }, // main road
    { tx: 6, ty: 7, tw: 2, th: 2 }, // farmhouse door
    { tx: 33, ty: 7, tw: 2, th: 2 }, // library door
    { tx: field.tx + field.gate.from, ty: 11, tw: field.gate.to - field.gate.from, th: 2 } // field gate
  ]

  const px = (t: number): number => t * TILE
  const props: Prop[] = [
    { kind: 'farmhouse', x: px(2), y: px(2) - 6, seed: 1 },
    { kind: 'mailbox', x: px(9) + 2, y: px(6) - 2, seed: 2 },
    { kind: 'shippingBin', x: px(10) + 4, y: px(7) - 8, seed: 3 },
    { kind: 'library', x: px(29), y: px(2) - 4, seed: 4 },
    { kind: 'bulletinBoard', x: px(24), y: px(6) - 2, seed: 5 }
  ]
  // A ring of trees and bushes around the edges, deterministic.
  const treeSpots: Array<[number, number]> = [
    [0, 0],
    [14, -1],
    [18, 0],
    [21, -1],
    [38, 0],
    [36, 6],
    [0, 12],
    [1, 17],
    [0, 22],
    [37, 13],
    [38, 18],
    [36, 23]
  ]
  treeSpots.forEach(([tx, ty], i) => props.push({ kind: 'tree', x: px(tx), y: px(ty), seed: 10 + i }))
  for (let ty = 28; ty < rows - 2; ty += 5) {
    props.push({ kind: 'tree', x: px(1), y: px(ty), seed: 40 + ty })
    props.push({ kind: 'tree', x: px(37), y: px(ty + 2), seed: 60 + ty })
  }
  const bushSpots: Array<[number, number]> = [
    [12, 6],
    [27, 6],
    [5, 14],
    [33, 15],
    [6, 24],
    [32, 28]
  ]
  bushSpots.forEach(([tx, ty], i) => props.push({ kind: 'bush', x: px(tx), y: px(ty), seed: 80 + i }))
  // Trees and bushes along the bottom edge.
  for (let tx = 4; tx < cols - 4; tx += 7) props.push({ kind: 'tree', x: px(tx), y: px(rows - 4), seed: 100 + tx })

  return { cols, rows, field, paths, props, slots }
}

/** The soil bed of a slot, in world pixels. */
export function bedRect(layout: WorldLayout, slot: number): Rect {
  const col = slot % FIELD_COLS
  const row = Math.floor(slot / FIELD_COLS)
  return {
    x: (layout.field.tx + 1 + col * SLOT_W) * TILE + TILE / 2,
    y: (layout.field.ty + 1 + row * SLOT_H) * TILE,
    w: BED_W * TILE,
    h: BED_H * TILE
  }
}

/** Where the farmer stands to tend a slot: just below its sign. */
export function tendSpot(layout: WorldLayout, slot: number): { x: number; y: number } {
  const bed = bedRect(layout, slot)
  return { x: bed.x + bed.w + 6, y: bed.y + bed.h + 4 }
}

/** Area that reacts to the pointer for a slot: the bed and its sign. */
export function slotHitRect(layout: WorldLayout, slot: number): Rect {
  const bed = bedRect(layout, slot)
  return { x: bed.x - 4, y: bed.y - 18, w: bed.w + 8, h: bed.h + 34 }
}

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h
}

// ---------------------------------------------------------------------------
// Camera. `zoom` is device pixels per world pixel (an integer, for crisp art);
// `x`/`y` is the world point at the centre of the view.

export interface Camera {
  x: number
  y: number
  zoom: number
}

export const MIN_ZOOM = 2
export const MAX_ZOOM = 6

/** Largest integer zoom at which `worldWidth` world pixels fit in `viewWidth` device pixels. */
export function fitZoom(viewWidth: number, worldWidth: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(viewWidth / worldWidth)))
}

export function worldToScreen(cam: Camera, viewW: number, viewH: number, x: number, y: number): { x: number; y: number } {
  const ox = Math.round(viewW / 2 - cam.x * cam.zoom)
  const oy = Math.round(viewH / 2 - cam.y * cam.zoom)
  return { x: ox + x * cam.zoom, y: oy + y * cam.zoom }
}

export function screenToWorld(cam: Camera, viewW: number, viewH: number, sx: number, sy: number): { x: number; y: number } {
  const ox = Math.round(viewW / 2 - cam.x * cam.zoom)
  const oy = Math.round(viewH / 2 - cam.y * cam.zoom)
  return { x: (sx - ox) / cam.zoom, y: (sy - oy) / cam.zoom }
}

/** Keep the view inside the map (or centred on it when the map is smaller than the view). */
export function clampCamera(cam: Camera, viewW: number, viewH: number, worldW: number, worldH: number): Camera {
  const halfW = viewW / 2 / cam.zoom
  const halfH = viewH / 2 / cam.zoom
  const clamp = (v: number, half: number, size: number): number => (size <= half * 2 ? size / 2 : Math.max(half, Math.min(size - half, v)))
  return { ...cam, x: clamp(cam.x, halfW, worldW), y: clamp(cam.y, halfH, worldH) }
}

/** Change zoom while keeping the world point under the cursor in place. */
export function zoomAt(cam: Camera, viewW: number, viewH: number, sx: number, sy: number, zoom: number): Camera {
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
  if (z === cam.zoom) return cam
  const world = screenToWorld(cam, viewW, viewH, sx, sy)
  return { zoom: z, x: world.x - (sx - viewW / 2) / z, y: world.y - (sy - viewH / 2) / z }
}
