import { useEffect, useRef } from 'react'
import { freeSlot as lowestFreeSlot } from '../../../shared/plotMachine'
import type { Plot } from '../../../shared/types'
import { AGENT_LABEL, statusLine } from '../labels'
import { Sprite } from '../sprite'
import { bedRect, clampCamera, contains, fitZoom, layoutWorld, screenToWorld, slotHitRect, tendSpot, TILE, zoomAt, type Camera, type PropKind } from './layout'
import { renderScene, type Scene } from './render'
import * as sprites from './sprites'
import { createWalker, stepWalker, walkTo } from './walker'

interface Props {
  plots: Plot[]
  harvestedCount: number
  now: number
  selectedId: string | null
  onSelect: (id: string) => void
  onPlant: () => void
}

const PROP_NAMES: Partial<Record<PropKind, string>> = {
  farmhouse: '农舍',
  library: '图书馆 · 知识库（即将开放）',
  mailbox: '信箱 · NPC 的来信（即将开放）',
  bulletinBoard: '公告栏 · 全局待办（即将开放）'
}

/** The farm as a game world: a canvas with a camera you can drag and zoom. */
export function FarmWorld(props: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props

  // Mutable world state lives outside React so the animation loop can run freely.
  const world = useRef({
    cam: null as Camera | null,
    camTarget: null as { x: number; y: number } | null,
    walker: createWalker(6.5 * TILE, 8 * TILE),
    hoverSlot: null as number | null,
    view: { w: 1, h: 1, dpr: 1 }
  })

  // Walk to (and pan to) the selected plot.
  useEffect(() => {
    const plot = props.plots.find((p) => p.id === props.selectedId)
    if (!plot) return
    const layout = layoutWorld(props.plots.map((p) => p.slot))
    const w = world.current
    walkTo(w.walker, layout, tendSpot(layout, plot.slot))
    const bed = bedRect(layout, plot.slot)
    w.camTarget = { x: bed.x + bed.w / 2, y: bed.y + bed.h / 2 }
  }, [props.selectedId])

  useEffect(() => {
    const el = canvas.current!
    const ctx = el.getContext('2d')!
    const w = world.current
    let frame = 0
    let last = performance.now()

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      const rect = wrap.current!.getBoundingClientRect()
      el.width = Math.max(1, Math.round(rect.width * dpr))
      el.height = Math.max(1, Math.round(rect.height * dpr))
      w.view = { w: el.width, h: el.height, dpr }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(wrap.current!)
    resize()

    const draw = (time: number): void => {
      frame = requestAnimationFrame(draw)
      const dt = Math.min(0.1, (time - last) / 1000)
      last = time
      const { plots } = latest.current
      const layout = layoutWorld(plots.map((p) => p.slot))
      const worldW = layout.cols * TILE
      const worldH = layout.rows * TILE
      const field = layout.field
      if (!w.cam) {
        // First frame: fit the field (plus a margin), with the farmhouse at the top.
        const zoom = fitZoom(w.view.w, (field.tw + 6) * TILE)
        w.cam = { zoom, x: (field.tx + field.tw / 2) * TILE, y: TILE + w.view.h / 2 / zoom }
      }
      if (w.camTarget) {
        // Glide until the selected plot is in the middle (or as close as the map edge allows).
        const goal = clampCamera({ ...w.cam, ...w.camTarget }, w.view.w, w.view.h, worldW, worldH)
        const k = Math.min(1, dt * 5)
        w.cam = { ...w.cam, x: w.cam.x + (goal.x - w.cam.x) * k, y: w.cam.y + (goal.y - w.cam.y) * k }
        if (Math.abs(goal.x - w.cam.x) < 0.5 && Math.abs(goal.y - w.cam.y) < 0.5) w.camTarget = null
      }
      w.cam = clampCamera(w.cam, w.view.w, w.view.h, worldW, worldH)
      stepWalker(w.walker, dt)
      const scene: Scene = {
        layout,
        plots,
        freeSlot: lowestFreeSlot(plots),
        selectedId: latest.current.selectedId,
        hoverSlot: w.hoverSlot,
        walker: w.walker,
        now: Date.now()
      }
      renderScene(ctx, w.view, w.cam, scene, time)
    }
    frame = requestAnimationFrame(draw)

    // Wheel zoom needs a non-passive listener to stop the page from scrolling.
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      if (!w.cam) return
      const { x, y } = devicePoint(e)
      w.cam = zoomAt(w.cam, w.view.w, w.view.h, x, y, w.cam.zoom + (e.deltaY < 0 ? 1 : -1))
      w.camTarget = null
    }
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  const devicePoint = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = canvas.current!.getBoundingClientRect()
    const dpr = world.current.view.dpr
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr }
  }

  /** What is under the pointer: a slot (plot or free ground) or a building. */
  const hitTest = (e: { clientX: number; clientY: number }): { slot: number | null; prop: PropKind | null } => {
    const w = world.current
    if (!w.cam) return { slot: null, prop: null }
    const { x, y } = devicePoint(e)
    const p = screenToWorld(w.cam, w.view.w, w.view.h, x, y)
    const { plots } = latest.current
    const layout = layoutWorld(plots.map((pl) => pl.slot))
    const free = lowestFreeSlot(plots)
    for (let slot = 0; slot < layout.slots; slot++) {
      if (!contains(slotHitRect(layout, slot), p.x, p.y)) continue
      if (slot === free || plots.some((pl) => pl.slot === slot)) return { slot, prop: null }
    }
    for (const prop of layout.props) {
      if (!PROP_NAMES[prop.kind] && prop.kind !== 'shippingBin') continue
      const s = sprites.prop(prop.kind, prop.seed)
      if (contains({ x: prop.x, y: prop.y, w: s.w, h: s.h }, p.x, p.y)) return { slot: null, prop: prop.kind }
    }
    return { slot: null, prop: null }
  }

  const drag = useRef<{ x: number; y: number; cam: Camera; moved: boolean } | null>(null)

  const showTip = (e: React.PointerEvent, text: string | null): void => {
    const el = tip.current!
    if (!text) {
      el.style.display = 'none'
      return
    }
    const rect = wrap.current!.getBoundingClientRect()
    el.textContent = text
    el.style.display = 'block'
    el.style.left = `${Math.min(e.clientX - rect.left + 14, rect.width - 260)}px`
    el.style.top = `${e.clientY - rect.top + 16}px`
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const w = world.current
    const d = drag.current
    if (d && w.cam) {
      const dpr = w.view.dpr
      const dx = (e.clientX - d.x) * dpr
      const dy = (e.clientY - d.y) * dpr
      if (d.moved || Math.hypot(dx, dy) > 6) {
        d.moved = true
        w.camTarget = null
        w.cam = { ...d.cam, x: d.cam.x - dx / d.cam.zoom, y: d.cam.y - dy / d.cam.zoom }
        showTip(e, null)
        return
      }
    }
    const hit = hitTest(e)
    w.hoverSlot = hit.slot
    canvas.current!.style.cursor = hit.slot !== null ? 'pointer' : d ? 'grabbing' : 'grab'
    const { plots, harvestedCount } = latest.current
    const plot = hit.slot !== null ? plots.find((p) => p.slot === hit.slot) : undefined
    if (plot) {
      const lines = [`${plot.name}（${AGENT_LABEL[plot.agent]}）`, statusLine(plot, Date.now()), plot.cwd]
      if (plot.note) lines.push(plot.note)
      showTip(e, lines.join('\n'))
    } else if (hit.prop) {
      showTip(e, hit.prop === 'shippingBin' ? `出货箱 · 已采摘 ${harvestedCount} 块地` : (PROP_NAMES[hit.prop] ?? null))
    } else {
      showTip(e, null)
    }
  }

  return (
    <section className="world" ref={wrap}>
      <canvas
        ref={canvas}
        className="world-canvas"
        onPointerDown={(e) => {
          if (!world.current.cam) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, cam: world.current.cam, moved: false }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (d?.moved) return
          const hit = hitTest(e)
          if (hit.slot === null) return
          const plot = latest.current.plots.find((p) => p.slot === hit.slot)
          if (plot) latest.current.onSelect(plot.id)
          else latest.current.onPlant()
        }}
        onPointerLeave={(e) => {
          world.current.hoverSlot = null
          showTip(e, null)
        }}
      />
      <div className="world-tip" ref={tip} />
      <div className="world-zoom">
        <button className="btn btn-icon" title="放大" onClick={() => zoomBy(world.current, 1)}>
          +
        </button>
        <button className="btn btn-icon" title="缩小" onClick={() => zoomBy(world.current, -1)}>
          −
        </button>
      </div>
      <Legend />
    </section>
  )
}

function zoomBy(w: { cam: Camera | null; view: { w: number; h: number } }, delta: number): void {
  if (!w.cam) return
  w.cam = zoomAt(w.cam, w.view.w, w.view.h, w.view.w / 2, w.view.h / 2, w.cam.zoom + delta)
}

function Legend() {
  return (
    <footer className="legend">
      <span>
        <Sprite name="drop" scale={2} /> 缺水：等你回复
      </span>
      <span>
        <Sprite name="bugIcon" scale={2} /> 有虫：等你审批
      </span>
      <span>
        <Sprite name="star" scale={2} /> 成熟：可以采摘
      </span>
      <span>
        <Sprite name="zzz" scale={2} /> 休眠
      </span>
      <span>
        <Sprite name="cross" scale={2} /> 出错了
      </span>
      <span className="legend-note">拖动看地图，滚轮缩放</span>
    </footer>
  )
}
