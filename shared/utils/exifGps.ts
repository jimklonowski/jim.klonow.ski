// Wipes GPS coordinates out of an image file's metadata, in place, without decoding or
// re-encoding the image. Every edit overwrites bytes (never inserts or removes), so container
// structure — JPEG segments, PNG chunks, RIFF chunks, ISO-BMFF boxes — stays valid, pixel data
// is untouched, and the non-GPS EXIF the app relies on (DateTimeOriginal for the photo date,
// Orientation for display) survives.
//
// How: find each embedded TIFF/EXIF block, walk its IFD chain, and where a GPS IFD pointer
// (tag 0x8825) exists, zero the GPS IFD's out-of-line values, its entries, and its entry count.
// The pointer is left aimed at the now-empty IFD, which is valid TIFF. All offsets are
// bounds-checked and the writes are collected first, applied only when the whole structure
// parsed cleanly — a malformed file is left byte-for-byte unchanged.
//
// Containers: JPEG (APP1 Exif, plus blanking an APP1 XMP packet if it mentions GPS), PNG (eXIf
// chunk, CRC recomputed), WebP (RIFF EXIF chunk), and ISO-BMFF (HEIC/HEIF/AVIF) plus anything
// unrecognized via an "Exif\0\0" signature scan — the strict TIFF validation makes a false
// positive a no-op. Known gaps, documented rather than handled: XMP inside PNG/HEIC (iPhones
// don't write GPS there) and MakerNotes (proprietary blobs; no known GPS copies).
//
// Relative imports would carry an explicit .ts; tests load this under Node's type stripping.

const EXIF_SIG = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // "Exif\0\0"
const XMP_SIG = 'http://ns.adobe.com/xap/1.0/'
const GPS_POINTER_TAG = 0x8825
const MAX_IFDS = 8
const MAX_ENTRIES = 512

// TIFF field type → bytes per element (type 0 / >13 are invalid).
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 }

interface Edit {
  /** Zero `len` bytes at `at`. */
  at: number
  len: number
}

/**
 * Wipe GPS metadata from an image file's bytes, in place. Returns true when any byte changed
 * (i.e. GPS data was present and is now gone); false when there was nothing to do or the file
 * couldn't be safely parsed.
 */
export function wipeGps(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return wipeJpeg(bytes)
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return wipePng(bytes)
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return wipeWebp(bytes)
  // ISO-BMFF (HEIC/HEIF/AVIF) starts with a box whose type at offset 4 is "ftyp". Its EXIF lives
  // in an item the meta box points at; rather than walk iinf/iloc, scan for the payload's own
  // signature — strict TIFF validation makes a stray match harmless.
  return scanForExif(bytes, 0, bytes.length)
}

function ascii(bytes: Uint8Array, at: number, len: number): string {
  let s = ''
  for (let i = at; i < at + len && i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return s
}

/** Apply zero-edits; true when any of the bytes were not already zero. */
function applyEdits(bytes: Uint8Array, edits: Edit[]): boolean {
  let changed = false
  for (const e of edits) {
    for (let i = e.at; i < e.at + e.len; i++) {
      if (bytes[i] !== 0) changed = true
      bytes[i] = 0
    }
  }
  return changed
}

// --- TIFF ---

/**
 * Walk the TIFF block at [tiffStart, tiffEnd) and zero any GPS IFD found from the IFD chain.
 * Collect-then-apply: nothing is written unless the structure parsed cleanly end to end.
 */
function wipeTiff(bytes: Uint8Array, tiffStart: number, tiffEnd: number): boolean {
  if (tiffEnd > bytes.length) tiffEnd = bytes.length
  if (tiffStart + 8 > tiffEnd) return false

  const order = ascii(bytes, tiffStart, 2)
  const little = order === 'II'
  if (!little && order !== 'MM') return false

  const u16 = (at: number) => little
    ? bytes[at]! | (bytes[at + 1]! << 8)
    : (bytes[at]! << 8) | bytes[at + 1]!
  const u32 = (at: number) => little
    ? (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0
    : ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0

  if (u16(tiffStart + 2) !== 42) return false

  const inBounds = (at: number, len: number) => at >= tiffStart && at + len <= tiffEnd

  const edits: Edit[] = []

  // The GPS IFD: zero every entry's out-of-line value, the entries themselves, and the count.
  function collectGpsWipe(ifdAt: number): boolean {
    if (!inBounds(ifdAt, 2)) return false
    const count = u16(ifdAt)
    if (count > MAX_ENTRIES || !inBounds(ifdAt, 2 + count * 12)) return false
    for (let i = 0; i < count; i++) {
      const entry = ifdAt + 2 + i * 12
      const size = TYPE_SIZE[u16(entry + 2)]
      if (!size) return false
      const byteLen = size * u32(entry + 4)
      if (byteLen > 4) {
        const valueAt = tiffStart + u32(entry + 8)
        // An out-of-range value pointer voids the whole wipe rather than risking a blind write.
        if (!inBounds(valueAt, byteLen)) return false
        edits.push({ at: valueAt, len: byteLen })
      }
      edits.push({ at: entry, len: 12 })
    }
    edits.push({ at: ifdAt, len: 2 }) // the entry count: an empty GPS IFD is valid TIFF
    return true
  }

  // Walk the IFD chain (IFD0 → IFD1 …) looking for GPS pointers.
  let ifdAt = tiffStart + u32(tiffStart + 4)
  for (let n = 0; n < MAX_IFDS && ifdAt > tiffStart; n++) {
    if (!inBounds(ifdAt, 2)) return false
    const count = u16(ifdAt)
    if (count > MAX_ENTRIES || !inBounds(ifdAt, 2 + count * 12 + 4)) return false
    for (let i = 0; i < count; i++) {
      const entry = ifdAt + 2 + i * 12
      if (u16(entry) === GPS_POINTER_TAG) {
        if (!collectGpsWipe(tiffStart + u32(entry + 8))) return false
      }
    }
    const next = u32(ifdAt + 2 + count * 12)
    ifdAt = next === 0 ? 0 : tiffStart + next
  }

  return applyEdits(bytes, edits)
}

/** Scan [from, to) for "Exif\0\0" signatures and wipe the TIFF block after each. */
function scanForExif(bytes: Uint8Array, from: number, to: number): boolean {
  let changed = false
  const limit = Math.min(to, bytes.length) - EXIF_SIG.length
  for (let i = from; i <= limit; i++) {
    if (!matches(bytes, i, EXIF_SIG)) continue
    if (wipeTiff(bytes, i + EXIF_SIG.length, to)) changed = true
    i += EXIF_SIG.length - 1
  }
  return changed
}

// --- JPEG ---

function wipeJpeg(bytes: Uint8Array): boolean {
  let changed = false
  let at = 2
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xFF) break
    const marker = bytes[at + 1]!
    // Standalone markers and the start of entropy-coded data end the metadata region.
    if (marker === 0xDA || marker === 0xD9) break
    if (marker >= 0xD0 && marker <= 0xD7) {
      at += 2
      continue
    }
    const len = (bytes[at + 2]! << 8) | bytes[at + 3]! // includes the length field itself
    if (len < 2 || at + 2 + len > bytes.length) break
    if (marker === 0xE1) {
      const payload = at + 4
      const payloadLen = len - 2
      if (matches(bytes, payload, EXIF_SIG)) {
        if (wipeTiff(bytes, payload + EXIF_SIG.length, payload + payloadLen)) changed = true
      }
      else if (ascii(bytes, payload, XMP_SIG.length) === XMP_SIG) {
        // XMP is XML; a GPS mention means location tags. Space-fill the packet after the
        // namespace header — length-preserving, and readers treat unparseable XMP as absent.
        const body = payload + XMP_SIG.length + 1 // the header's trailing NUL
        const text = ascii(bytes, body, payload + payloadLen - body)
        if (text.includes('GPS')) {
          for (let i = body; i < payload + payloadLen; i++) {
            if (bytes[i] !== 0x20) changed = true
            bytes[i] = 0x20
          }
        }
      }
    }
    at += 2 + len
  }
  return changed
}

function matches(bytes: Uint8Array, at: number, sig: number[]): boolean {
  if (at + sig.length > bytes.length) return false
  for (let i = 0; i < sig.length; i++) {
    if (bytes[at + i] !== sig[i]) return false
  }
  return true
}

// --- PNG ---

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array, at: number, len: number): number {
  let c = 0xFFFFFFFF
  for (let i = at; i < at + len; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xFF]! ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function wipePng(bytes: Uint8Array): boolean {
  let changed = false
  let at = 8
  while (at + 12 <= bytes.length) {
    const len = ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0
    const type = ascii(bytes, at + 4, 4)
    if (at + 12 + len > bytes.length) break
    if (type === 'eXIf' && wipeTiff(bytes, at + 8, at + 8 + len)) {
      changed = true
      // The chunk CRC covers type + data; rewrite it so strict decoders stay happy.
      const crc = crc32(bytes, at + 4, 4 + len)
      const crcAt = at + 8 + len
      bytes[crcAt] = (crc >>> 24) & 0xFF
      bytes[crcAt + 1] = (crc >>> 16) & 0xFF
      bytes[crcAt + 2] = (crc >>> 8) & 0xFF
      bytes[crcAt + 3] = crc & 0xFF
    }
    if (type === 'IEND') break
    at += 12 + len
  }
  return changed
}

// --- WebP (RIFF) ---

function wipeWebp(bytes: Uint8Array): boolean {
  let changed = false
  let at = 12
  while (at + 8 <= bytes.length) {
    const type = ascii(bytes, at, 4)
    const len = (bytes[at + 4]! | (bytes[at + 5]! << 8) | (bytes[at + 6]! << 16) | (bytes[at + 7]! << 24)) >>> 0
    if (at + 8 + len > bytes.length) break
    if (type === 'EXIF') {
      // Some writers include the "Exif\0\0" prefix, some store the bare TIFF.
      const tiffAt = matches(bytes, at + 8, EXIF_SIG) ? at + 8 + EXIF_SIG.length : at + 8
      if (wipeTiff(bytes, tiffAt, at + 8 + len)) changed = true
    }
    at += 8 + len + (len % 2) // chunks are padded to even lengths
  }
  return changed
}
