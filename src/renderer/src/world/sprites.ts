// Painted once, then reused every frame.

import { PALETTE, SPRITES, type SpriteName } from '../../../shared/sprites'
import * as art from './art'
import { TILE, type Prop, type WorldLayout } from './layout'
import * as town from './townArt'
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

/** Everything flat on the ground: grass, paths, plaza, river, cliff, the fence. */
export function ground(layout: WorldLayout): Sprite {
  const { field, plaza, river } = layout
  return cached(`ground-${layout.cols}x${layout.rows}`, () => {
    const p = new Pix(layout.cols * TILE, layout.rows * TILE)
    art.paintGrass(p, 7)
    layout.paths.forEach((path, i) => art.paintPath(p, path.tx, path.ty, path.tw, path.th, 20 + i))
    town.paintPlaza(p, plaza.tx, plaza.ty, plaza.tw, plaza.th, 11)
    const inRect = (r: { tx: number; ty: number; tw: number; th: number }, x: number, y: number, pad: number): boolean =>
      x >= r.tx * TILE - pad && x < (r.tx + r.tw) * TILE + pad && y >= r.ty * TILE - pad && y < (r.ty + r.th) * TILE + pad
    art.paintDecor(p, 9, Math.floor((p.w * p.h) / 900), (x, y) =>
      y < (layout.cliffRows + 1) * TILE ||
      inRect(field, x, y, 4) ||
      inRect(plaza, x, y, 2) ||
      inRect({ tx: river.tx, ty: 0, tw: river.tw, th: layout.rows }, x, y, 2) ||
      layout.paths.some((r) => inRect(r, x, y, 2))
    )
    art.paintFence(p, field.tx, field.ty, field.tw, field.th, field.gate)
    town.paintRiver(p, river.tx, river.tw, layout.cliffRows, 12)
    layout.bridges.forEach((b) => town.paintBridge(p, b.tx, b.ty, b.tw, b.th))
    // The cliff, leaving the waterfall visible.
    const cliff = new Pix(p.w, layout.cliffRows * TILE + 2)
    town.paintCliff(cliff, layout.cliffRows, 13)
    for (let y = 0; y < cliff.h; y++) {
      for (let x = 0; x < cliff.w; x++) {
        if (x >= river.tx * TILE && x < (river.tx + river.tw) * TILE) continue
        const c = cliff.get(x, y)
        if (c && c[3] > 0) p.set(x, y, c)
      }
    }
    return p
  })
}

export function soil(wet: boolean, variant: number): Sprite {
  return cached(`soil-${wet}-${variant % 4}`, () => art.soilBed(3, 2, wet, 40 + (variant % 4)))
}

export function emptyBed(): Sprite {
  return cached('empty-bed', () => art.emptyBed(3, 2))
}

export function prop(prop: Prop): Sprite {
  const { kind, seed } = prop
  switch (kind) {
    case 'farmhouse':
      return cached('farmhouse', art.farmhouse)
    case 'museum':
      return cached('museum', art.library)
    case 'communityCenter':
      return cached('community-center', town.communityCenter)
    case 'blacksmith':
      return cached('blacksmith', town.blacksmith)
    case 'junimoHut':
      return cached('junimo-hut', town.junimoHut)
    case 'mine':
      return cached('mine', town.mineEntrance)
    case 'fountain':
      return cached('fountain', town.fountain)
    case 'shippingBin':
      return cached('bin', art.shippingBin)
    case 'mailbox':
      return cached('mailbox', art.mailbox)
    case 'bulletinBoard':
      return cached('board', art.bulletinBoard)
    case 'lamp':
      return cached('lamp', town.lampPost)
    case 'tree':
      return cached(`tree-${seed % 6}`, () => art.tree(seed % 6))
    case 'autumnTree': {
      const colour = prop.variant ?? 'orange'
      return cached(`autumn-${colour}-${seed % 4}`, () => town.roundTree(seed % 4, colour))
    }
    case 'pine':
      return cached(`pine-${seed % 4}`, () => town.pineTree(seed % 4))
    case 'bush':
      return cached(`bush-${seed % 4}`, () => art.bush(seed % 4))
    case 'mushroom':
      return cached(`mushroom-${seed % 2}`, () => town.mushroom(seed % 2))
  }
}

export function junimo(colour: string, frame: 0 | 1): Sprite {
  return cached(`junimo-${colour}-${frame}`, () => town.junimo(colour, frame))
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
