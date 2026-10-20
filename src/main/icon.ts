import { nativeImage, type NativeImage } from 'electron'
import { PALETTE, rasterize, SPRITES } from '../shared/sprites'
import { encodePng } from './png'

function pumpkinPng(size: number): Buffer {
  const bmp = rasterize(SPRITES.pumpkin, PALETTE, Math.max(1, Math.round(size / 16)))
  return encodePng(bmp.width, bmp.height, bmp.data)
}

/** The pumpkin at `size` px, with a 2× representation for high-DPI screens. */
export function pumpkinIcon(size: number): NativeImage {
  const image = nativeImage.createFromBuffer(pumpkinPng(size), { scaleFactor: 1 })
  image.addRepresentation({ scaleFactor: 2, buffer: pumpkinPng(size * 2) })
  return image
}
