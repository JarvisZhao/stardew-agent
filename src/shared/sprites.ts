// Original pixel art, defined as character grids. Each character maps to a colour
// in a palette; '.' is transparent. Used by the UI and for the tray icon.

export type Palette = Readonly<Record<string, string>>

export const PALETTE: Palette = {
  x: '#2b1a0e', // outline
  g: '#3f8f2f', // leaf
  G: '#6cc24a', // leaf highlight
  d: '#24602a', // leaf shadow / stem
  o: '#e8862a', // pumpkin
  O: '#f6b04a', // pumpkin highlight
  r: '#b5561a', // pumpkin shadow
  b: '#3a5fd0', // blueberry
  B: '#8fb0ff', // blueberry highlight
  n: '#1f2f80', // blueberry shadow
  t: '#d9b070', // seed
  T: '#8a6030', // seed shadow
  w: '#a07c46', // withered stalk
  W: '#5c4020', // withered shadow
  u: '#3d9be9', // water
  U: '#bfe6ff', // water highlight
  R: '#d83a2a', // bug red
  P: '#ff8a7a', // bug highlight
  y: '#ffd84a', // star
  Y: '#fff3a8', // star highlight
  z: '#4a5a9a', // sleep
  k: '#7a4ab8', // book cover
  c: '#fff8e0', // paper
  s: '#a8a8b4', // steel
  S: '#6a6a74' // steel shadow
}

export const SOIL_DRY: Palette = { a: '#b07a42', b: '#80522a', c: '#c8935a' }
export const SOIL_WET: Palette = { a: '#6e4422', b: '#4a2c14', c: '#86562e' }
export const GRASS: Palette = { a: '#78b84e', b: '#5f9c3e', c: '#93d062' }

export const SPRITES = {
  seed: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '....xx....xx....',
    '...xtTx..xtTx...',
    '....xx....xx....',
    '................',
    '................'
  ],
  sprout: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...xxx....xxx...',
    '..xGGgx..xgGGx..',
    '...xggGxxGggx...',
    '....xxxgdxxx....',
    '.......xdx......',
    '.......xdx......',
    '................',
    '................'
  ],
  young: [
    '................',
    '................',
    '................',
    '.......xx.......',
    '......xGGx......',
    '..xx..xGgx..xx..',
    '.xGGx..xdx.xGGx.',
    '.xgGgx.xdxxgGgx.',
    '..xggxxxdxxggx..',
    '...xxdgxdxgdxx..',
    '.....xxgdgxx....',
    '......xxdxx.....',
    '.......xdx......',
    '.......xdx......',
    '................',
    '................'
  ],
  pumpkin: [
    '................',
    '................',
    '.......xxx......',
    '..xxx.xdgx.xxx..',
    '.xGGgxxdxxxgGGx.',
    '.xgggx.xdx.xgggx',
    '..xxx..xdx..xxx.',
    '...xxxxxxxxxx...',
    '..xOOorOOOroox..',
    '.xOOoorOOoroorx.',
    '.xOooorOooroorx.',
    '.xooooroooroorx.',
    '.xroooroooroorx.',
    '..xrrorrrorrrx..',
    '...xxxxxxxxxx...',
    '................'
  ],
  blueberry: [
    '................',
    '................',
    '.....xx..xx.....',
    '...xxGGxxGGxx...',
    '..xGGggGGggGGx..',
    '.xGgxxgGgxxgGgx.',
    '.xgxBbxgxBbxggx.',
    '.xgxbnxgxbnxgdx.',
    '.xdgxxgdgxxgddx.',
    '..xdgxBbxgdgdx..',
    '..xddxbnxdxBbx..',
    '...xxdgxxddxbnx.',
    '....xxdddxxxxx..',
    '......xxdxx.....',
    '.......xdx......',
    '................'
  ],
  withered: [
    '................',
    '................',
    '................',
    '................',
    '.......xx.......',
    '......xwWx......',
    '.....xwxWx......',
    '....xwx.xWx.....',
    '...xwx..xWx.xx..',
    '...xx...xWxxwWx.',
    '........xWx.xx..',
    '.......xxWxx....',
    '......xWWWWWx...',
    '.......xxxxx....',
    '................',
    '................'
  ],
  bug: [
    '..x......x..',
    '...x....x...',
    '....xxxx....',
    '..xxRRRRxx..',
    '.xRRPRxRRRx.',
    'xxRPRRxRRRxx',
    '.xRRRRxRRRx.',
    'xxRRRRxRRRxx',
    '..xxRRxRxx..',
    '.x..xxxx..x.'
  ],
  drop: [
    '...xx...',
    '..xUux..',
    '..xUux..',
    '.xUuuux.',
    '.xUuuux.',
    '.xuuuux.',
    '..xuux..',
    '...xx...'
  ],
  bugIcon: [
    '.x....x.',
    '..x..x..',
    '.xxxxxx.',
    'xRRxRRRx',
    'xRPxRRRx',
    'xRRxRRRx',
    '.xRxRRx.',
    'x.xxxx.x'
  ],
  star: [
    '...xx...',
    '..xyYx..',
    'xxxyyxxx',
    'xYyyyyyx',
    '.xyyyyx.',
    '..xyyx..',
    '.xyxxyx.',
    '.xx..xx.'
  ],
  zzz: [
    '.....zzz',
    '.......z',
    '......z.',
    '.zzz.zzz',
    '...z....',
    '..z.....',
    '.zzz....',
    '........'
  ],
  fire: ['...y....', '..yo....', '..yoy...', '.yooy.y.', '.yoRoyo.', 'yoRRRoo.', 'yoRRRRoy', '.yooooy.'],
  book: ['.xxxxxx.', '.xkkkkcx', '.xkkkkcx', '.xkyykcx', '.xkkkkcx', '.xkkkkcx', '.xkkkkcx', '.xxxxxx.'],
  pick: ['.xxxxxx.', 'xsssssSx', 'xSx..xSx', 'x..xT..x', '...xT...', '...xT...', '...xT...', '...xx...'],
  leaf: ['...xx...', '..xGGx..', '.xGggGx.', '.xggggx.', '..xggx..', '...xdx..', '...xdx..', '....x...'],
  exclaim: ['...xx...', '..xRRx..', '..xRRx..', '..xRRx..', '...xx...', '........', '..xRRx..', '...xx...'],
  scroll: ['.xxxxxx.', 'xccccccx', '.xcyycx.', '.xccccx.', '.xcyycx.', '.xccccx.', 'xccccccx', '.xxxxxx.'],
  cross: [
    'xx....xx',
    'xRx..xRx',
    '.xRxxRx.',
    '..xRRx..',
    '..xRRx..',
    '.xRxxRx.',
    'xRx..xRx',
    'xx....xx'
  ],
  soil: [
    'aaaaaaaaaaaaaaaa',
    'acaaaaaaacaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'aaaaaaaaaaaaaaaa',
    'aaaaacaaaaaaacaa',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'aaaaaaaaaaaaaaaa',
    'aacaaaaaaacaaaaa',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaacaaaaaaca',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb'
  ],
  grass: [
    'aaaaaaaaaaaaaaaa',
    'aaabaaaaaaaaaaaa',
    'aabcbaaaaaaaaaaa',
    'aaaaaaaaaaabaaaa',
    'aaaaaaaaaabcbaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa',
    'aaaaabaaaaaaaaaa',
    'aaaabcbaaaaaaaaa',
    'aaaaaaaaaaaaaaab',
    'aaaaaaaaaaaaaabc',
    'aaaaaaaaaaaaaaaa',
    'aabaaaaaaaaaaaaa',
    'abcbaaaaaaaabaaa',
    'aaaaaaaaaaabcbaa',
    'aaaaaaaaaaaaaaaa'
  ]
} as const satisfies Record<string, readonly string[]>

export type SpriteName = keyof typeof SPRITES

export interface Bitmap {
  width: number
  height: number
  /** RGBA, row-major. */
  data: Uint8ClampedArray<ArrayBuffer>
}

/** Rasterize a sprite into RGBA pixels, each sprite pixel becoming a scale×scale block. */
export function rasterize(rows: readonly string[], palette: Palette, scale = 1): Bitmap {
  const h = rows.length
  const w = Math.max(...rows.map((r) => r.length))
  const width = w * scale
  const height = h * scale
  const data = new Uint8ClampedArray(width * height * 4)
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const colour = palette[row[x]]
      if (!colour) continue
      const [r, g, b] = hexToRgb(colour)
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * width + x * scale + dx) * 4
          data[i] = r
          data[i + 1] = g
          data[i + 2] = b
          data[i + 3] = 255
        }
      }
    }
  })
  return { width, height, data }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
