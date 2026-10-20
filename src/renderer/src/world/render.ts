// Draws one frame of the farm: ground, beds, everything standing (sorted so
// things in front cover things behind), bubbles, then text labels at screen
// resolution so Chinese names stay sharp.

import { growthStage, wiltLevel } from '../../../shared/plotMachine'
import type { SpriteName } from '../../../shared/sprites'
import type { Plot, PlotState } from '../../../shared/types'
import { statusLine } from '../labels'
import { bedRect, type Camera, type WorldLayout } from './layout'
import * as sprites from './sprites'
import { walkFrame, type Walker } from './walker'

export interface Scene {
  layout: WorldLayout
  plots: Plot[]
  /** The lowest free slot, shown as ground ready for planting. */
  freeSlot: number
  selectedId: string | null
  hoverSlot: number | null
  walker: Walker
  now: number
}

export interface View {
  w: number
  h: number
  /** Device pixels per CSS pixel, for text sizes. */
  dpr: number
}

const BUBBLE: Record<PlotState, SpriteName | null> = {
  seeded: 'drop',
  growing: null,
  thirsty: 'drop',
  pest: 'bugIcon',
  withered: 'cross',
  ripe: 'star',
  dormant: 'zzz'
}

const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", system-ui, sans-serif'

interface Standing {
  baseline: number
  draw: () => void
}

export function renderScene(ctx: CanvasRenderingContext2D, view: View, cam: Camera, scene: Scene, t: number): void {
  const z = cam.zoom
  const ox = Math.round(view.w / 2 - cam.x * z)
  const oy = Math.round(view.h / 2 - cam.y * z)
  const sx = (x: number): number => ox + Math.round(x * z)
  const sy = (y: number): number => oy + Math.round(y * z)
  const put = (s: sprites.Sprite, x: number, y: number, flip = false): void => {
    if (!flip) {
      ctx.drawImage(s.image, sx(x), sy(y), s.w * z, s.h * z)
      return
    }
    ctx.save()
    ctx.translate(sx(x) + s.w * z, sy(y))
    ctx.scale(-1, 1)
    ctx.drawImage(s.image, 0, 0, s.w * z, s.h * z)
    ctx.restore()
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#4f8a33'
  ctx.fillRect(0, 0, view.w, view.h)

  const { layout } = scene
  put(sprites.ground(layout), 0, 0)

  const bySlot = new Map(scene.plots.map((p) => [p.slot, p]))
  const tick = Math.floor(t / 500)

  // Beds lie flat on the ground.
  for (let slot = 0; slot < layout.slots; slot++) {
    const bed = bedRect(layout, slot)
    const plot = bySlot.get(slot)
    if (plot) {
      ctx.filter = plot.state === 'dormant' ? 'brightness(0.78) saturate(0.6)' : 'none'
      put(sprites.soil(plot.state === 'growing', slot), bed.x, bed.y)
      ctx.filter = 'none'
    } else if (slot === scene.freeSlot) {
      put(sprites.emptyBed(), bed.x - 1, bed.y - 2)
    }
    const selected = plot && plot.id === scene.selectedId
    if (selected || (scene.hoverSlot === slot && (plot || slot === scene.freeSlot))) {
      ctx.lineWidth = Math.max(2, Math.round(z * 0.75))
      ctx.strokeStyle = selected ? '#ffd84a' : 'rgba(255, 248, 224, 0.85)'
      ctx.strokeRect(sx(bed.x - 2), sy(bed.y - 2), (bed.w + 4) * z, (bed.h + 7) * z)
    }
  }

  // Everything that stands up, sorted by where it touches the ground.
  const standing: Standing[] = []
  for (const prop of layout.props) {
    const s = sprites.prop(prop.kind, prop.seed)
    standing.push({ baseline: prop.y + s.h - 4, draw: () => put(s, prop.x, prop.y) })
  }
  for (const plot of scene.plots) {
    const bed = bedRect(layout, plot.slot)
    const name = cropSprite(plot)
    const s = sprites.crop(name)
    const wilt = wiltLevel(plot, scene.now)
    const filter =
      plot.state === 'dormant'
        ? 'brightness(0.75) saturate(0.5)'
        : wilt === 2
          ? 'saturate(0.35) sepia(0.5) brightness(0.92)'
          : wilt === 1
            ? 'saturate(0.6) brightness(0.96)'
            : 'none'
    for (let i = 0; i < 3; i++) {
      const sway = plot.state === 'growing' && (tick + i + plot.slot) % 2 === 0 ? 1 : 0
      const x = bed.x + i * 16 + sway
      const y = bed.y + 6 + wilt
      standing.push({
        baseline: y + 15,
        draw: () => {
          ctx.filter = filter
          put(s, x, y)
          ctx.filter = 'none'
        }
      })
    }
    if (plot.state === 'pest' && plot.running) {
      const span = bed.w - 14
      const phase = (t / 2600 + plot.slot * 0.37) % 2
      const x = bed.x + 1 + Math.round((phase < 1 ? phase : 2 - phase) * span)
      standing.push({ baseline: bed.y + 30, draw: () => put(sprites.bug(), x, bed.y + 14) })
    }
  }
  const w = scene.walker
  const farmerSprite = sprites.farmer(w.facing, walkFrame(w))
  standing.push({ baseline: w.y, draw: () => put(farmerSprite, Math.round(w.x - 8), Math.round(w.y - 25), w.facing === 'side' && w.left) })

  standing.sort((a, b) => a.baseline - b.baseline)
  for (const s of standing) s.draw()

  // Bubbles and sparkles float above everything.
  for (const plot of scene.plots) {
    const bed = bedRect(layout, plot.slot)
    const icon = BUBBLE[plot.state]
    if (icon) {
      const bob = plot.state === 'dormant' || plot.state === 'ripe' ? 0 : (tick + plot.slot) % 2
      put(sprites.bubble(icon), bed.x + bed.w - 8, bed.y - 15 - bob)
    }
    if (plot.state === 'ripe') {
      ctx.fillStyle = '#fff3a8'
      for (let i = 0; i < 3; i++) {
        if ((tick + i) % 3 === 0) continue
        const px = bed.x + 6 + ((i * 17 + plot.slot * 5) % (bed.w - 10))
        const py = bed.y + 2 + ((i * 11 + plot.slot * 3) % 14)
        ctx.fillRect(sx(px), sy(py - 1), z, z * 3)
        ctx.fillRect(sx(px - 1), sy(py), z * 3, z)
      }
    }
  }

  // Name signs, drawn at screen resolution.
  for (let slot = 0; slot < layout.slots; slot++) {
    const plot = bySlot.get(slot)
    if (!plot && slot !== scene.freeSlot) continue
    const bed = bedRect(layout, slot)
    const cx = sx(bed.x + bed.w / 2)
    const top = sy(bed.y + bed.h + 4)
    label(ctx, view.dpr, cx, top, plot ? plot.name : '开垦新地', plot ? statusLine(plot, scene.now) : '点这里开一个新会话', plot?.state ?? null, plot?.id === scene.selectedId)
  }
}

function cropSprite(plot: Plot): SpriteName {
  if (plot.state === 'withered') return 'withered'
  const stage = growthStage(plot)
  if (stage === 'mature') return plot.agent === 'codex' ? 'blueberry' : 'pumpkin'
  return stage
}

const LABEL_BG: Partial<Record<PlotState, string>> = { pest: '#f0a090', ripe: '#ffe27a' }

function label(ctx: CanvasRenderingContext2D, dpr: number, cx: number, top: number, name: string, status: string, state: PlotState | null, selected: boolean): void {
  const nameSize = Math.round(13 * dpr)
  const statusSize = Math.round(11 * dpr)
  const pad = Math.round(6 * dpr)
  const border = Math.max(2, Math.round(2 * dpr))
  ctx.font = `bold ${nameSize}px ${FONT}`
  const name1 = ellipsize(ctx, name, 150 * dpr)
  const nameW = ctx.measureText(name1).width
  ctx.font = `${statusSize}px ${FONT}`
  const statusW = ctx.measureText(status).width
  const w = Math.round(Math.max(nameW, statusW) + pad * 2)
  const h = Math.round(nameSize + statusSize + pad * 1.6)
  const x = Math.round(cx - w / 2)
  ctx.fillStyle = selected ? '#ffd84a' : '#2b1a0e'
  ctx.fillRect(x - border, top - border, w + border * 2, h + border * 2)
  ctx.fillStyle = state === null ? 'rgba(244, 228, 188, 0.82)' : (LABEL_BG[state] ?? '#d99a5b')
  ctx.fillRect(x, top, w, h)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
  ctx.fillRect(x, top, w, border)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#2b1a0e'
  ctx.font = `bold ${nameSize}px ${FONT}`
  ctx.fillText(name1, cx, top + Math.round(pad * 0.55))
  ctx.fillStyle = '#4a2c14'
  ctx.font = `${statusSize}px ${FONT}`
  ctx.fillText(status, cx, top + Math.round(pad * 0.55) + nameSize + Math.round(2 * dpr))
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1)
  return `${s}…`
}
