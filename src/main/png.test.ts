import { describe, expect, it } from 'vitest'
import zlib from 'node:zlib'
import { encodePng } from './png'

describe('encodePng', () => {
  it('writes a valid RGBA PNG', () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0])
    const png = encodePng(2, 1, pixels)
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(png.toString('ascii', 12, 16)).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(2)
    expect(png.readUInt32BE(20)).toBe(1)

    const idatLength = png.readUInt32BE(33)
    expect(png.toString('ascii', 37, 41)).toBe('IDAT')
    const raw = zlib.inflateSync(png.subarray(41, 41 + idatLength))
    expect(Array.from(raw)).toEqual([0, ...pixels])
  })
})
