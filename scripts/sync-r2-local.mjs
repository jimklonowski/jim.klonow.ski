#!/usr/bin/env node
// Mirrors the R2 objects referenced by the LOCAL D1 database (lab/DEXA source PDFs and progress
// photos) from the real buckets into wrangler's local R2 emulation (.wrangler/state/v3), so
// they open in `pnpm dev`. Run after re-baselining local D1 from prod:
//
//   pnpm sync:local:r2      (or as part of `pnpm sync:local`)
//
// Idempotent: objects already present locally are skipped, so re-runs only fetch new uploads.
// Local reads/writes go through wrangler's programmatic bindings (getPlatformProxy) — the only
// spawned processes are the remote downloads, which run DOWNLOAD_CONCURRENCY wide.
// Requires a wrangler login with access to the buckets. Stop `pnpm dev` before running.
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPlatformProxy } from 'wrangler'

const execAsync = promisify(exec)
const DOWNLOAD_CONCURRENCY = 6

const MIME = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic'
}

const proxy = await getPlatformProxy({
  configPath: 'wrangler.jsonc',
  persist: { path: '.wrangler/state/v3' }
})
const { DB, LABS_BUCKET, PHOTOS_BUCKET } = proxy.env
const BUCKETS = {
  'jim-klonow-ski-labs': LABS_BUCKET,
  'jim-klonow-ski-photos': PHOTOS_BUCKET
}

// --- Collect [bucketName, key] pairs from local D1 ---
const targets = new Map() // "bucket/key" -> { bucketName, key }
function add(bucketName, key) {
  if (key) targets.set(`${bucketName}/${key}`, { bucketName, key })
}

for (const row of (await DB.prepare('SELECT sources FROM labs_entries').all()).results) {
  for (const key of JSON.parse(row.sources || '[]')) add('jim-klonow-ski-labs', key)
}
for (const row of (await DB.prepare('SELECT sources FROM dexa_entries').all()).results) {
  for (const key of JSON.parse(row.sources || '[]')) add('jim-klonow-ski-labs', key)
}
for (const row of (await DB.prepare('SELECT r2_key, thumb_r2_key FROM progress_photos').all()).results) {
  add('jim-klonow-ski-photos', row.r2_key)
  add('jim-klonow-ski-photos', row.thumb_r2_key)
}

console.log(`${targets.size} objects referenced by local D1`)

// --- Skip what's already local (in-process head calls, no spawns) ---
const missing = []
for (const { bucketName, key } of targets.values()) {
  if (await BUCKETS[bucketName].head(key)) continue
  missing.push({ bucketName, key })
}
console.log(`${targets.size - missing.length} already local, ${missing.length} to fetch`)

// --- Download missing objects from the real buckets, DOWNLOAD_CONCURRENCY at a time ---
const tmp = mkdtempSync(join(tmpdir(), 'r2-sync-'))
let synced = 0
let failed = 0
let fileSeq = 0

async function syncOne({ bucketName, key }) {
  const tmpFile = join(tmp, `obj-${fileSeq++}`)
  try {
    await execAsync(
      `npx wrangler r2 object get "${bucketName}/${key.replaceAll('"', '\\"')}" --remote --file "${tmpFile}"`,
      { maxBuffer: 1024 * 1024 }
    )
    const ext = key.split('.').pop()?.toLowerCase() ?? ''
    await BUCKETS[bucketName].put(key, readFileSync(tmpFile), {
      httpMetadata: { contentType: MIME[ext] ?? 'application/octet-stream' }
    })
    synced++
    console.log(`  [${synced + failed}/${missing.length}] ${bucketName}/${key}`)
  }
  catch (err) {
    failed++
    console.warn(`  FAILED ${bucketName}/${key}: ${err.stderr?.split('\n').at(-2) ?? err.message}`)
  }
  finally {
    rmSync(tmpFile, { force: true })
  }
}

try {
  const queue = [...missing]
  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, async () => {
    while (queue.length) await syncOne(queue.shift())
  }))
}
finally {
  rmSync(tmp, { recursive: true, force: true })
  await proxy.dispose()
}

console.log(`Done: ${synced} synced, ${failed} failed, ${targets.size - missing.length} were already local.`)
process.exit(failed ? 1 : 0)
