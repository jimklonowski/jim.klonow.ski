// The /ticker Open Graph card: the raster and PNG encoder (shared/utils/pixelCanvas.ts), the ink
// hexes against main.css, and the card itself (shared/utils/tickerCard.ts) decoded back out of
// its PNG.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'
import { createRaster, drawText, encodePng, fillRect, hasGlyph, hexToRgb, textWidth } from '../shared/utils/pixelCanvas.ts'
import { INK_HEX, TOKEN_HEX, TOKEN_PROPERTY } from '../shared/utils/tickerInks.ts'
import { CARD_HEIGHT, CARD_WIDTH, renderTickerCard } from '../shared/utils/tickerCard.ts'
import { crc32 } from '../shared/utils/exifGps.ts'

const deflate = bytes => new Uint8Array(deflateSync(bytes))
const px = (r, x, y) => Array.from(r.data.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 3))

test('the token hexes match main.css, so the Worker draws the theme the browser shows', () => {
  const css = readFileSync('app/assets/css/main.css', 'utf8')
  for (const [token, property] of Object.entries(TOKEN_PROPERTY)) {
    const m = new RegExp(`${property}:\\s*(#[0-9a-fA-F]{6})`).exec(css)
    assert.ok(m, `${property} is declared in main.css`)
    assert.equal(TOKEN_HEX[token].toLowerCase(), m[1].toLowerCase(), token)
  }
  for (const [ink, hex] of Object.entries(INK_HEX)) assert.match(hex, /^#[0-9a-f]{6}$/i, ink)
})

test('rectangles and text land where they are drawn', () => {
  const r = createRaster(40, 20, hexToRgb('#000000'))
  fillRect(r, 2, 3, 4, 5, hexToRgb('#ff0000'))
  assert.deepEqual(px(r, 2, 3), [255, 0, 0])
  assert.deepEqual(px(r, 5, 7), [255, 0, 0])
  assert.deepEqual(px(r, 6, 7), [0, 0, 0], 'outside the rect')
  fillRect(r, 38, 18, 10, 10, hexToRgb('#00ff00')) // clipped, no throw
  assert.deepEqual(px(r, 39, 19), [0, 255, 0])

  const t = createRaster(20, 10, hexToRgb('#000000'))
  drawText(t, 'T', 1, 1, 1, hexToRgb('#ffffff'))
  assert.deepEqual(px(t, 1, 1), [255, 255, 255], 'T: the bar')
  assert.deepEqual(px(t, 3, 7), [255, 255, 255], 'T: the stem')
  assert.deepEqual(px(t, 1, 7), [0, 0, 0])
  assert.equal(textWidth('TICKER', 2), (6 * 6 - 1) * 2)
  for (const ch of 'TICKER RESIDENT COMPANION DAY STREAK ASLEEP JIM.KLONOW.SKI 0123456789·-') assert.ok(hasGlyph(ch), `glyph for ${JSON.stringify(ch)}`)
})

test('the PNG is well formed and inflates back to the pixels', () => {
  const r = createRaster(7, 5, hexToRgb('#102030'))
  fillRect(r, 1, 1, 2, 2, hexToRgb('#e86a5e'))
  const png = encodePng(r, deflate)
  assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(png.buffer, png.byteOffset)
  assert.equal(view.getUint32(8), 13, 'IHDR length')
  assert.equal(String.fromCharCode(...png.subarray(12, 16)), 'IHDR')
  assert.equal(view.getUint32(16), 7)
  assert.equal(view.getUint32(20), 5)
  assert.equal(png[24], 8, 'bit depth')
  assert.equal(png[25], 6, 'RGBA')
  assert.equal(view.getUint32(29), crc32(png, 12, 17), 'IHDR CRC covers type + data')
  const idatLen = view.getUint32(33)
  assert.equal(String.fromCharCode(...png.subarray(37, 41)), 'IDAT')
  const raw = inflateSync(png.subarray(41, 41 + idatLen))
  assert.equal(raw.length, (7 * 4 + 1) * 5, 'one filter byte per scanline')
  assert.equal(raw[0], 0, 'filter none')
  const row1 = 7 * 4 + 1 // one scanline: the filter byte, then seven RGBA pixels
  assert.deepEqual(Array.from(raw.subarray(row1 + 1 + 4, row1 + 1 + 8)), [0xE8, 0x6A, 0x5E, 255], 'row 1, pixel 1 is the heart red')
  assert.deepEqual(Array.from(raw.subarray(1, 5)), [0x10, 0x20, 0x30, 255], 'row 0, pixel 0 is the background')
  assert.equal(String.fromCharCode(...png.subarray(png.length - 8, png.length - 4)), 'IEND')
})

test('the card is 1200×630, shows the heart, the words and the figures, and sleeps after bedtime', () => {
  const awake = renderTickerCard({ accessories: ['crown', 'shades'], build: {}, asleep: false, ageDays: 251, streak: 190, site: 'jim.klonow.ski' })
  assert.deepEqual([awake.width, awake.height], [CARD_WIDTH, CARD_HEIGHT])
  const count = (r, hex) => {
    const [a, b, c] = hexToRgb(hex)
    let n = 0
    for (let i = 0; i < r.data.length; i += 4) if (r.data[i] === a && r.data[i + 1] === b && r.data[i + 2] === c) n++
    return n
  }
  assert.ok(count(awake, TOKEN_HEX.danger) > 2000, 'the heart is drawn')
  assert.ok(count(awake, INK_HEX.clip) > 0, 'the crown is on')
  assert.ok(count(awake, TOKEN_HEX.hi) > 500, 'TICKER in the headline colour')
  assert.ok(count(awake, TOKEN_HEX.accent) > 100, 'the EKG')

  const asleep = renderTickerCard({ accessories: ['crown', 'shades'], build: {}, asleep: true, ageDays: 251, streak: 190, site: 'x' })
  assert.notEqual(count(asleep, TOKEN_HEX.bg), count(awake, TOKEN_HEX.bg), 'a different pose and no shades')
  const png = encodePng(awake, deflate)
  assert.ok(png.length > 2000 && png.length < 200_000, `a sensible size: ${png.length} bytes`)
})
