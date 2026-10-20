import { describe, expect, it } from 'vitest'
import { GRASS, PALETTE, rasterize, SOIL_DRY, SPRITES } from './sprites'

describe('sprites', () => {
  it('have rectangular grids that only use known colours', () => {
    const known = new Set(['.', ...Object.keys(PALETTE), ...Object.keys(SOIL_DRY), ...Object.keys(GRASS)])
    for (const [name, rows] of Object.entries(SPRITES)) {
      const widths = new Set(rows.map((r) => r.length))
      expect(widths.size, `${name} rows differ in width`).toBe(1)
      for (const ch of rows.join('')) expect(known.has(ch), `${name} uses unknown colour ${ch}`).toBe(true)
    }
  })

  it('rasterizes with scaling and transparency', () => {
    const bmp = rasterize(['x.'], PALETTE, 2)
    expect(bmp.width).toBe(4)
    expect(bmp.height).toBe(2)
    expect(Array.from(bmp.data.slice(0, 4))).toEqual([0x2b, 0x1a, 0x0e, 255])
    expect(bmp.data[2 * 4 + 3]).toBe(0)
  })
})
