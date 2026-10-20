// A tiny pixel-art canvas: everything in the world is painted with these
// primitives at native resolution (16 px per tile) and scaled up with
// nearest-neighbour filtering.

export type Rgba = [number, number, number, number]

export function hex(color: string, alpha = 255): Rgba {
  const n = parseInt(color.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha]
}

/** Darken (amount < 0) or lighten (amount > 0) a colour, keeping alpha. */
export function shade(color: Rgba, amount: number): Rgba {
  const f = (c: number): number => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)))
  return [f(color[0]), f(color[1]), f(color[2]), color[3]]
}

/** Deterministic random numbers so textures look the same on every launch. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Pix {
  readonly data: Uint8ClampedArray<ArrayBuffer>

  constructor(
    readonly w: number,
    readonly h: number
  ) {
    this.data = new Uint8ClampedArray(w * h * 4)
  }

  get(x: number, y: number): Rgba | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null
    const i = (y * this.w + x) * 4
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]
  }

  opaque(x: number, y: number): boolean {
    const p = this.get(x, y)
    return p !== null && p[3] > 0
  }

  set(x: number, y: number, c: Rgba): void {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const i = (y * this.w + x) * 4
    if (c[3] >= 255 || this.data[i + 3] === 0) {
      this.data[i] = c[0]
      this.data[i + 1] = c[1]
      this.data[i + 2] = c[2]
      this.data[i + 3] = c[3]
      return
    }
    // Blend translucent colour over what is there (used for shadows).
    const a = c[3] / 255
    this.data[i] = Math.round(this.data[i] * (1 - a) + c[0] * a)
    this.data[i + 1] = Math.round(this.data[i + 1] * (1 - a) + c[1] * a)
    this.data[i + 2] = Math.round(this.data[i + 2] * (1 - a) + c[2] * a)
    this.data[i + 3] = Math.max(this.data[i + 3], c[3])
  }

  rect(x: number, y: number, w: number, h: number, c: Rgba): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
    return this
  }

  hline(x: number, y: number, w: number, c: Rgba): this {
    return this.rect(x, y, w, 1, c)
  }

  vline(x: number, y: number, h: number, c: Rgba): this {
    return this.rect(x, y, 1, h, c)
  }

  /** Filled ellipse; `fill` can vary the colour per pixel (for shading). */
  ellipse(cx: number, cy: number, rx: number, ry: number, fill: Rgba | ((x: number, y: number, dx: number, dy: number) => Rgba | null)): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy > 1) continue
        const c = typeof fill === 'function' ? fill(x, y, dx, dy) : fill
        if (c) this.set(x, y, c)
      }
    }
    return this
  }

  /** Draw a 1 px outline around everything opaque (only on transparent pixels). */
  outline(c: Rgba, diagonal = false): this {
    const marks: Array<[number, number]> = []
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.opaque(x, y)) continue
        const near =
          this.opaque(x - 1, y) ||
          this.opaque(x + 1, y) ||
          this.opaque(x, y - 1) ||
          this.opaque(x, y + 1) ||
          (diagonal && (this.opaque(x - 1, y - 1) || this.opaque(x + 1, y - 1) || this.opaque(x - 1, y + 1) || this.opaque(x + 1, y + 1)))
        if (near) marks.push([x, y])
      }
    }
    for (const [x, y] of marks) this.set(x, y, c)
    return this
  }

  /** Copy another Pix onto this one, skipping transparent pixels. */
  blit(src: Pix, ox: number, oy: number, flip = false): this {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const p = src.get(flip ? src.w - 1 - x : x, y)!
        if (p[3] > 0) this.set(ox + x, oy + y, p)
      }
    }
    return this
  }

  /** Paint a sprite given as text rows with a palette ('.' is transparent). */
  sprite(rows: readonly string[], palette: Record<string, string>, ox = 0, oy = 0): this {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const colour = palette[row[x]]
        if (colour) this.set(ox + x, oy + y, hex(colour))
      }
    })
    return this
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = this.w
    canvas.height = this.h
    canvas.getContext('2d')!.putImageData(new ImageData(this.data, this.w, this.h), 0, 0)
    return canvas
  }
}
