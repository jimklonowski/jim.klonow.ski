import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crc32 as zlibCrc32 } from 'node:zlib'
import exifr from 'exifr'
import { crc32, wipeGps } from '../shared/utils/exifGps.ts'

// Fixtures are built by hand so the tests know exactly which bytes hold coordinates, then
// cross-checked through exifr — the same parser the upload path uses for the photo date.

/** A minimal TIFF: IFD0 (Orientation, DateTime out-of-line, GPS pointer) + GPS IFD. */
function buildTiff({ little = true, gps = true } = {}) {
  const size = 196
  const buf = new Uint8Array(size)
  const view = new DataView(buf.buffer)
  const u16 = (at, v) => view.setUint16(at, v, little)
  const u32 = (at, v) => view.setUint32(at, v, little)
  const text = (at, s) => {
    for (let i = 0; i < s.length; i++) buf[at + i] = s.charCodeAt(i)
  }
  const entry = (at, tag, type, count, value) => {
    u16(at, tag)
    u16(at + 2, type)
    u32(at + 4, count)
    value(at + 8)
    return at + 12
  }

  text(0, little ? 'II' : 'MM')
  u16(2, 42)
  u32(4, 8) // IFD0 offset

  const ifd0 = 8
  const dateAt = ifd0 + 2 + 3 * 12 + 4 // fixed layout regardless of entry count
  const gpsIfd = dateAt + 20
  const latAt = gpsIfd + 2 + 4 * 12 + 4
  const lonAt = latAt + 24

  u16(ifd0, gps ? 3 : 2)
  let e = ifd0 + 2
  e = entry(e, 0x0112, 3, 1, at => u16(at, 6)) // Orientation = 6
  e = entry(e, 0x0132, 2, 20, at => u32(at, dateAt)) // DateTime, out of line
  if (gps) e = entry(e, 0x8825, 4, 1, at => u32(at, gpsIfd))
  u32(e, 0) // no next IFD

  text(dateAt, '2026:09:29 10:00:00\0')

  u16(gpsIfd, 4)
  e = gpsIfd + 2
  e = entry(e, 0x0001, 2, 2, at => text(at, 'N\0')) // GPSLatitudeRef
  e = entry(e, 0x0002, 5, 3, at => u32(at, latAt)) // GPSLatitude
  e = entry(e, 0x0003, 2, 2, at => text(at, 'W\0')) // GPSLongitudeRef
  e = entry(e, 0x0004, 5, 3, at => u32(at, lonAt)) // GPSLongitude
  u32(e, 0)

  // 41° 53' 30.00" N / 87° 37' 0" W — rationals, numerator/denominator pairs.
  const rat = (at, ...pairs) => pairs.forEach((v, i) => u32(at + i * 4, v))
  rat(latAt, 41, 1, 53, 1, 3000, 100)
  rat(lonAt, 87, 1, 37, 1, 0, 1)

  return { buf, gpsIfd, latAt }
}

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]

function jpegWith(app1Payloads) {
  const parts = [[0xFF, 0xD8]]
  for (const payload of app1Payloads) {
    const len = payload.length + 2
    parts.push([0xFF, 0xE1, (len >> 8) & 0xFF, len & 0xFF], payload)
  }
  parts.push([0xFF, 0xDA, 0x00, 0x02, 0x3F, 0x00, 0x12, 0x34], [0xFF, 0xD9])
  const flat = parts.flatMap(p => [...p])
  return new Uint8Array(flat)
}

function exifPayload(tiff) {
  return [...EXIF_HEADER, ...tiff]
}

test('JPEG: GPS wiped, orientation and date survive, exifr agrees', async () => {
  const { buf: tiff, gpsIfd, latAt } = buildTiff()
  const jpeg = jpegWith([exifPayload(tiff)])

  const before = await exifr.parse(Buffer.from(jpeg), { gps: true, translateValues: false })
  assert.equal(before.latitude?.toFixed(4), '41.8917')

  assert.equal(wipeGps(jpeg), true)

  const tiffAt = jpeg.indexOf(0x45) + EXIF_HEADER.length // first APP1 payload
  const view = new DataView(jpeg.buffer)
  assert.equal(view.getUint16(tiffAt + gpsIfd, true), 0, 'GPS entry count zeroed')
  for (let i = 0; i < 24; i++) assert.equal(jpeg[tiffAt + latAt + i], 0, 'latitude bytes zeroed')

  const after = await exifr.parse(Buffer.from(jpeg), { gps: true, translateValues: false })
  assert.equal(after.latitude, undefined)
  assert.equal(after.longitude, undefined)
  assert.equal(after.Orientation ?? after.orientation, 6)
  const dt = after.ModifyDate ?? after.DateTime // exifr names tag 0x0132 ModifyDate
  assert.ok(dt instanceof Date || typeof dt === 'string', 'date tag survives the wipe')

  assert.equal(wipeGps(jpeg), false, 'second pass is a no-op')
})

test('JPEG big-endian TIFF', async () => {
  const { buf: tiff } = buildTiff({ little: false })
  const jpeg = jpegWith([exifPayload(tiff)])
  assert.equal((await exifr.gps(Buffer.from(jpeg)))?.latitude?.toFixed(4), '41.8917')
  assert.equal(wipeGps(jpeg), true)
  assert.equal(await exifr.gps(Buffer.from(jpeg)), undefined)
})

test('JPEG without GPS is untouched', () => {
  const { buf: tiff } = buildTiff({ gps: false })
  const jpeg = jpegWith([exifPayload(tiff)])
  const copy = Uint8Array.from(jpeg)
  assert.equal(wipeGps(jpeg), false)
  assert.deepEqual(jpeg, copy)
})

test('JPEG XMP packet mentioning GPS is blanked; one without survives', () => {
  const xmp = ns => [...Buffer.from(`${ns}\0<x:xmpmeta><exif:GPSLatitude>41.89</exif:GPSLatitude></x:xmpmeta>`)]
  const clean = ns => [...Buffer.from(`${ns}\0<x:xmpmeta><dc:title>hello</dc:title></x:xmpmeta>`)]
  const NS = 'http://ns.adobe.com/xap/1.0/'

  const withGps = jpegWith([xmp(NS)])
  assert.equal(wipeGps(withGps), true)
  assert.equal(Buffer.from(withGps).includes('GPSLatitude'), false)
  assert.equal(Buffer.from(withGps).includes(NS), true, 'namespace header stays')

  const withoutGps = jpegWith([clean(NS)])
  const copy = Uint8Array.from(withoutGps)
  assert.equal(wipeGps(withoutGps), false)
  assert.deepEqual(withoutGps, copy)
})

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, zlibCrc32(out.subarray(4, 8 + data.length)))
  return out
}

test('PNG eXIf chunk: GPS wiped and the chunk CRC recomputed', async () => {
  const { buf: tiff } = buildTiff()
  const ihdr = pngChunk('IHDR', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]))
  const exif = pngChunk('eXIf', tiff)
  const iend = pngChunk('IEND', new Uint8Array(0))
  const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...ihdr, ...exif, ...iend])

  assert.equal((await exifr.gps(Buffer.from(png)))?.latitude?.toFixed(4), '41.8917')
  assert.equal(wipeGps(png), true)
  assert.equal(await exifr.gps(Buffer.from(png)), undefined)

  // The rewritten CRC must match a fresh computation over type + data.
  const at = 8 + ihdr.length
  const stored = new DataView(png.buffer).getUint32(at + 8 + tiff.length)
  assert.equal(stored, zlibCrc32(png.subarray(at + 4, at + 8 + tiff.length)))
})

test('WebP EXIF chunk, with and without the Exif header prefix', () => {
  const build = (payload) => {
    const chunk = [...Buffer.from('EXIF'), payload.length & 0xFF, (payload.length >> 8) & 0xFF, (payload.length >> 16) & 0xFF, (payload.length >> 24) & 0xFF, ...payload]
    if (payload.length % 2) chunk.push(0)
    const size = 4 + chunk.length
    return new Uint8Array([...Buffer.from('RIFF'), size & 0xFF, (size >> 8) & 0xFF, (size >> 16) & 0xFF, (size >> 24) & 0xFF, ...Buffer.from('WEBP'), ...chunk])
  }
  for (const prefix of [true, false]) {
    const { buf: tiff, gpsIfd } = buildTiff()
    const payload = prefix ? exifPayload(tiff) : [...tiff]
    const webp = build(payload)
    assert.equal(wipeGps(webp), true, `prefix=${prefix}`)
    const tiffAt = webp.length - tiff.length
    assert.equal(new DataView(webp.buffer).getUint16(tiffAt + gpsIfd, true), 0)
  }
})

test('HEIC-style container found by signature scan', () => {
  const { buf: tiff, gpsIfd } = buildTiff()
  const heic = new Uint8Array(64 + EXIF_HEADER.length + tiff.length + 32)
  heic.set([0, 0, 0, 0x18], 0)
  heic.set(Buffer.from('ftypheic'), 4)
  heic.set(EXIF_HEADER, 64)
  heic.set(tiff, 64 + EXIF_HEADER.length)
  assert.equal(wipeGps(heic), true)
  assert.equal(new DataView(heic.buffer).getUint16(64 + EXIF_HEADER.length + gpsIfd, true), 0)
})

test('corrupt structures are left byte-for-byte alone', () => {
  // GPS pointer aimed outside the buffer: the whole wipe is voided, nothing written.
  const { buf: tiff } = buildTiff()
  const view = new DataView(tiff.buffer)
  view.setUint32(8 + 2 + 2 * 12 + 8, 60000, true) // GPSInfo value → far out of bounds
  const jpeg = jpegWith([exifPayload(tiff)])
  const copy = Uint8Array.from(jpeg)
  assert.equal(wipeGps(jpeg), false)
  assert.deepEqual(jpeg, copy)

  // Truncated mid-IFD.
  const { buf: tiff2 } = buildTiff()
  const short = jpegWith([exifPayload(tiff2.subarray(0, 20))])
  const copy2 = Uint8Array.from(short)
  assert.equal(wipeGps(short), false)
  assert.deepEqual(short, copy2)

  // Not an image at all (the demo silhouettes are SVG).
  const svg = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'))
  assert.equal(wipeGps(svg), false)
})

test('module crc32 matches zlib', () => {
  const data = new Uint8Array([...Buffer.from('eXIf'), 1, 2, 3, 250, 0, 42])
  assert.equal(crc32(data, 0, data.length), zlibCrc32(data))
  assert.equal(crc32(data, 2, 5), zlibCrc32(data.subarray(2, 7)))
})
