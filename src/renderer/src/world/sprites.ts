// Painted once, then reused every frame.

import { PALETTE, SPRITES, type SpriteName } from '../../../shared/sprites'
import * as art from './art'
import { TILE, type PropKind, type WorldLayout } from './layout'
import { hex, Pix } from './pixel'

export interface Sprite {
  image: HTMLCanvasElement
  w: number
  h: number
}

const cache = new Map<string, Sprite>()

function cached(key: string, paint: () => Pix): Sprite {
  let sprite = cache.get(key)
  if (!sprite) {
    const pix = paint()
    sprite = { image: pix.toCanvas(), w: pix.w, h: pix.h }
    cache.set(key, sprite)
  }
  return sprite
}

/** Everything flat on the ground: grass, paths, flowers, the fence. */
export function ground(layout: WorldLayout): Sprite {
  const { field } = layout
  return cached(`ground-${layout.cols}x${layout.rows}`, () => {
    const p = new Pix(layout.cols * TILE, layout.rows * TILE)
    art.paintGrass(p, 7)
    layout.paths.forEach((path, i) => art.paintPath(p, path.tx, path.ty, path.tw, path.th, 20 + i))
    const inField = (x: number, y: number): boolean =>
      x > field.tx * TILE - 4 && x < (field.tx + field.tw) * TILE + 4 && y > field.ty * TILE - 4 && y < (field.ty + field.th) * TILE + 4
    const onPath = (x: number, y: number): boolean =>
      layout.paths.some((r) => x >= r.tx * TILE - 2 && x < (r.tx + r.tw) * TILE + 2 && y >= r.ty * TILE - 2 && y < (r.ty + r.th) * TILE + 2)
    art.paintDecor(p, 9, Math.floor((p.w * p.h) / 900), (x, y) => inField(x, y) || onPath(x, y))
    art.paintFence(p, field.tx, field.ty, field.tw, field.th, field.gate)
    return p
  })
}

export function soil(wet: boolean, variant: number): Sprite {
  return cached(`soil-${wet}-${variant % 4}`, () => art.soilBed(3, 2, wet, 40 + (variant % 4)))
}

export function emptyBed(): Sprite {
  return cached('empty-bed', () => art.emptyBed(3, 2))
}

export function prop(kind: PropKind, seed: number): Sprite {
  switch (kind) {
    case 'farmhouse':
      return cached('farmhouse', art.farmhouse)
    case 'library':
      return cached('library', art.library)
    case 'shippingBin':
      return cached('bin', art.shippingBin)
    case 'mailbox':
      return cached('mailbox', art.mailbox)
    case 'bulletinBoard':
      return cached('board', art.bulletinBoard)
    case 'tree':
      return cached(`tree-${seed % 6}`, () => art.tree(seed % 6))
    case 'bush':
      return cached(`bush-${seed % 4}`, () => art.bush(seed % 4))
  }
}

/** A crop sprite from the shared set, with a little shadow under it. */
export function crop(name: SpriteName): Sprite {
  return cached(`crop-${name}`, () => {
    const p = new Pix(16, 17)
    p.ellipse(8, 14.5, 5, 1.6, [20, 30, 10, 60])
    p.sprite(SPRITES[name], PALETTE)
    return p
  })
}

export function bug(): Sprite {
  return cached('bug', () => new Pix(12, 10).sprite(SPRITES.bug, PALETTE))
}

/** A speech bubble with an 8×8 icon, tail at the bottom left. */
export function bubble(icon: SpriteName): Sprite {
  return cached(`bubble-${icon}`, () => {
    const p = new Pix(14, 16)
    const ink = hex('#2b1a0e')
    const paper = icon === 'bugIcon' ? hex('#ffd6cf') : hex('#fff8e0')
    p.rect(1, 0, 12, 13, ink)
    p.rect(0, 1, 14, 11, ink)
    p.rect(1, 1, 12, 11, paper)
    p.rect(3, 13, 3, 1, ink)
    p.rect(3, 12, 2, 1, paper)
    p.set(3, 14, ink)
    p.sprite(SPRITES[icon], PALETTE, 3, 2)
    return p
  })
}

export function farmer(facing: art.Facing, step: 0 | 1 | 2): Sprite {
  return cached(`farmer-${facing}-${step}`, () => art.farmer(facing, step))
}
