#!/usr/bin/env node
// One-off retrofit: wipe GPS EXIF from progress photos that were uploaded before the upload
// path started stripping it (shared/utils/exifGps.ts — in-place byte edit, pixels/orientation/
// dates untouched). New uploads never need this.
//
//   node scripts/strip-photo-gps.mjs --local [--dry]     wrangler's local R2 (stop `pnpm dev` first)
//   node scripts/strip-photo-gps.mjs --remote [--dry]    the real photos bucket (wrangler login)
//
// --dry reports which files carry GPS without writing anything. Keys come from progress_photos
// (originals and thumbnails; thumbnails are canvas re-encodes that never carry EXIF, so they
// report clean). demo/ keys are the seeded silhouette SVGs and are skipped. Idempotent: a file
// already wiped reports clean.
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { wipeGps } from '../shared/utils/exifGps.ts'

const execAsync = promisify(exec)
const BUCKET = 'jim-klonow-ski-photos'
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' }

const remote = process.argv.includes('--remote')
const local = process.argv.includes('--local')
const dry = process.argv.includes('--dry')
if (remote === local) {
  console.error('Pass exactly one of --local or --remote (plus --dry to only report).')
  process.exit(1)
}

const keysFromRows = rows => [...new Set(rows.flatMap(r => [r.r2_key, r.thumb_r2_key]).filter(k => k && !k.startsWith('demo/')))]
const contentTypeFor = key => MIME[key.split('.').pop()?.toLowerCase()] ?? 'application/octet-stream'

let changed = 0
let clean = 0
let failed = 0

if (local) {
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: '.wrangler/state/v3' } })
  try {
    const { DB, PHOTOS_BUCKET } = proxy.env
    const rows = (await DB.prepare('SELECT r2_key, thumb_r2_key FROM progress_photos').all()).results
    for (const key of keysFromRows(rows)) {
      const obj = await PHOTOS_BUCKET.get(key)
      if (!obj) {
        failed++
        console.warn(`  MISSING ${key}`)
        continue
      }
      const bytes = new Uint8Array(await obj.arrayBuffer())
      if (!wipeGps(bytes)) {
        clean++
        continue
      }
      changed++
      console.log(`  GPS ${dry ? 'found' : 'wiped'}: ${key}`)
      if (!dry) await PHOTOS_BUCKET.put(key, bytes, { httpMetadata: { contentType: obj.httpMetadata?.contentType ?? contentTypeFor(key) } })
    }
  }
  finally {
    await proxy.dispose()
  }
}
else {
  const { stdout } = await execAsync('npx wrangler d1 execute DB --remote --json -y --command "SELECT r2_key, thumb_r2_key FROM progress_photos"')
  const rows = JSON.parse(stdout)[0].results
  const tmp = mkdtempSync(join(tmpdir(), 'gps-strip-'))
  try {
    for (const key of keysFromRows(rows)) {
      const file = join(tmp, 'obj')
      const quoted = `"${BUCKET}/${key.replaceAll('"', '\\"')}"`
      try {
        await execAsync(`npx wrangler r2 object get ${quoted} --remote --file "${file}"`, { maxBuffer: 1024 * 1024 })
        const bytes = new Uint8Array(readFileSync(file))
        if (!wipeGps(bytes)) {
          clean++
          continue
        }
        changed++
        console.log(`  GPS ${dry ? 'found' : 'wiped'}: ${key}`)
        if (!dry) {
          writeFileSync(file, bytes)
          await execAsync(`npx wrangler r2 object put ${quoted} --remote --file "${file}" --content-type "${contentTypeFor(key)}"`, { maxBuffer: 1024 * 1024 })
        }
      }
      catch (err) {
        failed++
        console.warn(`  FAILED ${key}: ${err.stderr?.split('\n').at(-2) ?? err.message}`)
      }
      finally {
        rmSync(file, { force: true })
      }
    }
  }
  finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

console.log(`${dry ? '[dry run] ' : ''}Done: ${changed} with GPS${dry ? '' : ' (wiped)'}, ${clean} clean, ${failed} failed.`)
process.exit(failed ? 1 : 0)
