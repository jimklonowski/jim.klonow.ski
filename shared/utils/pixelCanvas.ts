// A tiny RGBA raster with the three things the Open Graph card needs — rectangles, TICKER's
// sprite cells, and a 5×7 pixel font — and a PNG encoder on top. Pure: the deflate step is
// injected (node:zlib on the Worker and in the tests), so this file has no runtime dependency
// and the plain-node tests can draw and decode a whole card.
import { crc32 } from './exifGps.ts'
import type { TickerCell } from './tickerSprite.ts'

export type Rgb = [number, number, number]

export interface Raster {
  width: number
  height: number
  /** RGBA, row-major, alpha always 255. */
  data: Uint8Array
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function createRaster(width: number, height: number, bg: Rgb): Raster {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg[0]
    data[i + 1] = bg[1]
    data[i + 2] = bg[2]
    data[i + 3] = 255
  }
  return { width, height, data }
}

export function fillRect(r: Raster, x: number, y: number, w: number, h: number, rgb: Rgb) {
  const x0 = Math.max(0, Math.round(x))
  const y0 = Math.max(0, Math.round(y))
  const x1 = Math.min(r.width, Math.round(x + w))
  const y1 = Math.min(r.height, Math.round(y + h))
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * r.width + xx) * 4
      r.data[i] = rgb[0]
      r.data[i + 1] = rgb[1]
      r.data[i + 2] = rgb[2]
    }
  }
}

/** A line of the given thickness, one square per step (Bresenham). */
export function drawLine(r: Raster, x0: number, y0: number, x1: number, y1: number, thickness: number, rgb: Rgb) {
  let x = Math.round(x0)
  let y = Math.round(y0)
  const ex = Math.round(x1)
  const ey = Math.round(y1)
  const dx = Math.abs(ex - x)
  const dy = -Math.abs(ey - y)
  const sx = x < ex ? 1 : -1
  const sy = y < ey ? 1 : -1
  let err = dx + dy
  for (;;) {
    fillRect(r, x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, rgb)
    if (x === ex && y === ey) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

/** The sprite's cells as squares of `px` with `gap` between them, like the companion's CSS grid. */
export function drawCells(r: Raster, cells: TickerCell[], cols: number, x: number, y: number, px: number, gap: number, inks: Record<string, string>) {
  const pitch = px + gap
  cells.forEach((cell, i) => {
    if (!cell.ink) return
    const col = i % cols
    const row = Math.floor(i / cols)
    fillRect(r, x + col * pitch, y + row * pitch, px, px, hexToRgb(inks[cell.ink] ?? '#ff00ff'))
  })
}

// --- a 5×7 pixel font: the letters, digits and marks the card uses ---------------------------

const GLYPHS: Record<string, string[]> = {
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'G': ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.####'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  ':': ['.....', '..#..', '.....', '.....', '.....', '..#..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....']
}

export const FONT_COLS = 5
export const FONT_ROWS = 7

export function hasGlyph(ch: string): boolean {
  return ch.toUpperCase() in GLYPHS
}

/** Width in pixels of `text` at `scale`: 5 columns plus a 1-column gap per character. */
export function textWidth(text: string, scale: number): number {
  return text.length ? (text.length * (FONT_COLS + 1) - 1) * scale : 0
}

/** Draws `text` (uppercased; unknown characters render as a space) with its top-left at x, y. */
export function drawText(r: Raster, text: string, x: number, y: number, scale: number, rgb: Rgb) {
  let cx = x
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' ']!
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < FONT_COLS; gx++) {
        if (row[gx] === '#') fillRect(r, cx + gx * scale, y + gy * scale, scale, scale, rgb)
      }
    })
    cx += (FONT_COLS + 1) * scale
  }
}

// --- PNG -----------------------------------------------------------------------------------------

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out, 4, 4 + body.length))
  return out
}

/** An 8-bit RGBA PNG. `deflate` is zlib's (node:zlib deflateSync or equivalent). */
export function encodePng(r: Raster, deflate: (bytes: Uint8Array) => Uint8Array): Uint8Array {
  const stride = r.width * 4
  const raw = new Uint8Array((stride + 1) * r.height)
  for (let y = 0; y < r.height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    raw.set(r.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, r.width)
  view.setUint32(4, r.height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  const parts = [new Uint8Array(PNG_SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', deflate(raw)), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
