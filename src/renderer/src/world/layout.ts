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

export type PropKind =
  | 'farmhouse'
  | 'museum'
  | 'communityCenter'
  | 'blacksmith'
  | 'junimoHut'
  | 'mine'
  | 'fountain'
  | 'shippingBin'
  | 'mailbox'
  | 'bulletinBoard'
  | 'lamp'
  | 'tree'
  | 'autumnTree'
  | 'pine'
  | 'bush'
  | 'mushroom'

export interface Prop {
  kind: PropKind
  /** Top-left of the sprite in world pixels. */
  x: number
  y: number
  seed: number
  /** Colour for autumn trees. */
  variant?: 'orange' | 'yellow' | 'green'
}

/** Places a Junimo can go, besides its own plot. */
export type Place = 'blacksmith' | 'museum' | 'mine' | 'plaza' | 'hut' | 'bin'

export interface TileRect {
  tx: number
  ty: number
  tw: number
  th: number
}

export interface WorldLayout {
  /** Map size in tiles. */
  cols: number
  rows: number
  /** Rows of cliff along the top. */
  cliffRows: number
  river: { tx: number; tw: number }
  bridges: TileRect[]
  plaza: TileRect
  field: TileRect & { gate: { from: number; to: number } }
  /** Dirt paths, in tiles. */
  paths: TileRect[]
  props: Prop[]
  /** Where Junimos gather at each place (world pixels, feet position). */
  places: Record<Place, { x: number; y: number }>
  /** Number of slots drawn (used + one free to plant). */
  slots: number
}

const FIELD_TX = 2
const FIELD_TY = 14

/** Lay out the town for plots occupying `usedSlots` (their slot numbers). */
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
  const cols = 56
  const rows = Math.max(32, field.ty + field.th + 5)
  const cliffRows = 3
  const river = { tx: 45, tw: 3 }
  const plaza = { tx: 23, ty: 10, tw: 14, th: 7 }
  const bridges = [
    { tx: river.tx, ty: 10, tw: river.tw, th: 2 },
    { tx: river.tx, ty: 22, tw: river.tw, th: 2 }
  ]

  const paths = [
    { tx: 1, ty: 10, tw: plaza.tx - 1, th: 2 }, // main road, west of the plaza
    { tx: plaza.tx + plaza.tw, ty: 10, tw: river.tx - plaza.tx - plaza.tw, th: 2 }, // to the bridge
    { tx: river.tx + river.tw, ty: 10, tw: cols - river.tx - river.tw - 1, th: 2 }, // east of the river
    { tx: 6, ty: 8, tw: 2, th: 2 }, // farmhouse door
    { tx: field.tx + field.gate.from, ty: 12, tw: field.gate.to - field.gate.from, th: 2 }, // field gate
    { tx: 29, ty: 17, tw: 2, th: 5 }, // plaza to the hut
    { tx: 29, ty: 22, tw: river.tx - 29, th: 2 }, // hut to the south bridge
    { tx: river.tx + river.tw, ty: 22, tw: 5, th: 2 }, // south bridge to the museum
    { tx: 51, ty: 19, tw: 2, th: 3 }, // museum steps
    { tx: 52, ty: 8, tw: 2, th: 2 }, // blacksmith door
    { tx: 39, ty: 3, tw: 2, th: 7 } // up to the mine
  ]

  const px = (t: number): number => t * TILE
  const props: Prop[] = [
    { kind: 'farmhouse', x: px(2), y: px(3) - 4, seed: 1 },
    { kind: 'mailbox', x: px(8) + 4, y: px(7) - 2, seed: 2 },
    { kind: 'shippingBin', x: px(10), y: px(8) - 6, seed: 3 },
    { kind: 'communityCenter', x: px(23) + 8, y: px(3) - 6, seed: 4 },
    { kind: 'fountain', x: px(29) - 6, y: px(12) + 6, seed: 5 },
    { kind: 'bulletinBoard', x: px(34) - 4, y: px(11) + 2, seed: 6 },
    { kind: 'mine', x: px(38) - 2, y: 2, seed: 7 },
    { kind: 'blacksmith', x: px(48), y: px(3) - 8, seed: 8 },
    { kind: 'museum', x: px(48) + 4, y: px(14), seed: 9 },
    { kind: 'junimoHut', x: px(27) + 4, y: px(19) - 8, seed: 10 }
  ]
  const lamps: Array<[number, number]> = [
    [plaza.tx, plaza.ty - 1],
    [plaza.tx + plaza.tw - 1, plaza.ty - 1],
    [plaza.tx, plaza.ty + plaza.th - 2],
    [plaza.tx + plaza.tw - 1, plaza.ty + plaza.th - 2],
    [river.tx - 1, 8],
    [river.tx + river.tw, 20]
  ]
  lamps.forEach(([tx, ty], i) => props.push({ kind: 'lamp', x: px(tx) + 3, y: px(ty) - 4, seed: 20 + i }))
  for (const [tx, ty, seed] of [
    [26, 20, 0],
    [27, 21, 1],
    [33, 20, 2],
    [34, 19, 3]
  ]) {
    props.push({ kind: 'mushroom', x: px(tx), y: px(ty), seed })
  }

  // Trees: pines under the cliff, autumn trees around the town, a forest edge at the bottom.
  const pines: Array<[number, number]> = [
    [0, 1],
    [13, 1],
    [17, 1],
    [43, 1],
    [53, 1]
  ]
  pines.forEach(([tx, ty], i) => props.push({ kind: 'pine', x: px(tx), y: px(ty), seed: 30 + i }))
  const colours = ['orange', 'yellow', 'green'] as const
  const autumn: Array<[number, number]> = [
    [20, 5],
    [36, 18],
    [41, 14],
    [41, 26],
    [24, 24],
    [33, 26],
    [49, 25],
    [53, 13],
    [0, 13]
  ]
  autumn.forEach(([tx, ty], i) => props.push({ kind: 'autumnTree', x: px(tx), y: px(ty), seed: 40 + i, variant: colours[i % 3] }))
  for (let tx = 1, i = 0; tx < cols - 2; tx += 4, i++) {
    if (tx > river.tx - 3 && tx < river.tx + river.tw + 1) continue
    const kind = i % 3 === 2 ? 'pine' : 'autumnTree'
    props.push({ kind, x: px(tx), y: px(rows - 3) - 4 * (i % 2), seed: 60 + i, variant: colours[(i + 1) % 3] })
  }
  for (let ty = field.ty + 2; ty < rows - 4; ty += 5) {
    props.push({ kind: 'autumnTree', x: px(field.tx + field.tw) + 2, y: px(ty), seed: 80 + ty, variant: colours[ty % 3] })
  }
  const bushes: Array<[number, number]> = [
    [12, 7],
    [21, 8],
    [37, 8],
    [44, 13],
    [54, 18],
    [22, 19]
  ]
  bushes.forEach(([tx, ty], i) => props.push({ kind: 'bush', x: px(tx), y: px(ty), seed: 90 + i }))

  const places: Record<Place, { x: number; y: number }> = {
    blacksmith: { x: px(52), y: px(9) + 6 },
    museum: { x: px(52), y: px(20) + 4 },
    mine: { x: px(40), y: px(4) + 4 },
    plaza: { x: px(30), y: px(15) + 2 },
    hut: { x: px(30), y: px(22) + 4 },
    bin: { x: px(11), y: px(9) + 2 }
  }

  return { cols, rows, cliffRows, river, bridges, plaza, field, paths, props, places, slots }
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

/** Zoom 1 is for an overview of the whole town; the camera starts at 2 or more. */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 6

/** Largest integer zoom (2 or more) at which `worldWidth` world pixels fit in `viewWidth` device pixels. */
export function fitZoom(viewWidth: number, worldWidth: number): number {
  return Math.max(2, Math.min(MAX_ZOOM, Math.floor(viewWidth / worldWidth)))
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
