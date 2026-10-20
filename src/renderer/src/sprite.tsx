import { PALETTE, rasterize, SPRITES, type Palette, type SpriteName } from '../../shared/sprites'

const cache = new Map<string, string>()

/** Data URL of a sprite at 1× scale; CSS scales it up with pixelated rendering. */
export function spriteUrl(name: SpriteName, palette: Palette = PALETTE): string {
  const key = `${name}|${Object.values(palette).join(',')}`
  let url = cache.get(key)
  if (!url) {
    const bmp = rasterize(SPRITES[name], palette)
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    canvas.getContext('2d')!.putImageData(new ImageData(bmp.data, bmp.width, bmp.height), 0, 0)
    url = canvas.toDataURL()
    cache.set(key, url)
  }
  return url
}

export function Sprite({ name, scale, palette, className }: { name: SpriteName; scale: number; palette?: Palette; className?: string }) {
  const rows = SPRITES[name]
  return (
    <img
      src={spriteUrl(name, palette)}
      width={rows[0].length * scale}
      height={rows.length * scale}
      className={className ? `sprite ${className}` : 'sprite'}
      alt=""
      draggable={false}
    />
  )
}
