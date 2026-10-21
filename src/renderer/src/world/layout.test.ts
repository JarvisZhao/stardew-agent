import { describe, expect, it } from 'vitest'
import { bedRect, clampCamera, contains, FIELD_COLS, fitZoom, layoutWorld, screenToWorld, slotHitRect, TILE, worldToScreen, zoomAt } from './layout'

describe('layoutWorld', () => {
  it('always leaves one free slot and grows the field by rows', () => {
    expect(layoutWorld([]).slots).toBe(FIELD_COLS * 2)
    const big = layoutWorld([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(big.slots).toBe(10)
    expect(big.field.th).toBeGreaterThan(layoutWorld([]).field.th)
  })

  it('keeps a gap slot open when the highest slot is far out', () => {
    expect(layoutWorld([11]).slots).toBe(13)
  })

  it('places beds inside the fence without overlapping', () => {
    const layout = layoutWorld([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    const fence = { x: layout.field.tx * TILE, y: layout.field.ty * TILE, w: layout.field.tw * TILE, h: layout.field.th * TILE }
    const beds = Array.from({ length: layout.slots }, (_, i) => bedRect(layout, i))
    for (const b of beds) {
      expect(b.x).toBeGreaterThan(fence.x)
      expect(b.y).toBeGreaterThan(fence.y)
      expect(b.x + b.w).toBeLessThan(fence.x + fence.w)
      expect(b.y + b.h).toBeLessThan(fence.y + fence.h)
    }
    for (let i = 0; i < beds.length; i++) {
      for (let j = i + 1; j < beds.length; j++) {
        const a = beds[i]
        const b = beds[j]
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap, `slots ${i} and ${j}`).toBe(false)
      }
    }
  })

  it('hit-tests a slot by its bed', () => {
    const layout = layoutWorld([0])
    const bed = bedRect(layout, 5)
    expect(contains(slotHitRect(layout, 5), bed.x + 3, bed.y + 3)).toBe(true)
    expect(contains(slotHitRect(layout, 4), bed.x + 3, bed.y + 3)).toBe(false)
  })
})

describe('camera', () => {
  const cam = { x: 100, y: 50, zoom: 3 }

  it('converts between screen and world both ways', () => {
    const s = worldToScreen(cam, 800, 600, 120, 70)
    expect(screenToWorld(cam, 800, 600, s.x, s.y)).toEqual({ x: 120, y: 70 })
    expect(worldToScreen(cam, 800, 600, 100, 50)).toEqual({ x: 400, y: 300 })
  })

  it('fits an integer zoom within limits', () => {
    expect(fitZoom(1200, 300)).toBe(4)
    expect(fitZoom(500, 300)).toBe(2)
    expect(fitZoom(10_000, 300)).toBe(6)
  })

  it('zooms around the cursor', () => {
    const before = screenToWorld(cam, 800, 600, 200, 150)
    const zoomed = zoomAt(cam, 800, 600, 200, 150, 4)
    const after = screenToWorld(zoomed, 800, 600, 200, 150)
    expect(after.x).toBeCloseTo(before.x, 0)
    expect(after.y).toBeCloseTo(before.y, 0)
    expect(zoomAt(cam, 800, 600, 0, 0, 99).zoom).toBe(6)
    expect(zoomAt(cam, 800, 600, 0, 0, 0).zoom).toBe(1)
  })

  it('keeps the view inside the map', () => {
    expect(clampCamera({ x: -500, y: -500, zoom: 2 }, 800, 600, 1000, 1000)).toEqual({ x: 200, y: 150, zoom: 2 })
    expect(clampCamera({ x: 0, y: 0, zoom: 2 }, 800, 600, 300, 200)).toEqual({ x: 150, y: 100, zoom: 2 })
  })
})
