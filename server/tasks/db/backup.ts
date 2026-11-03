import { localToday } from '#shared/utils/time'
import { backupToSqlStatements, baselineFrom, collapseReport, tableCounts } from '#shared/utils/backup'

// Weekly snapshot of the main D1 database into R2 — see shared/utils/backup.ts for the format
// and why Time Travel alone isn't enough. Restore: download the object and run
// scripts/restore-backup.mjs.
//
// Stored in the labs bucket under backups/, which the PDF proxy refuses to serve (isLabPdfKey).
// Only the main DB: the demo sandbox is rebuilt from its seed every night.
//
// Verified before it counts (audit #43 item 46) — a backup used to be "the task returned":
//  - the snapshot must turn into restore SQL (the 90 KB statement cap surfaced only at restore);
//  - its per-table row counts are compared with the previous backup's: a table gone or halved is
//    a collapse (shared/utils/backup.ts), and that copy is stored under suspect/ — never the
//    next week's baseline, never counted or pruned;
//  - the stored object is read back and must decompress to the exact JSON that was written.
// Any of those fails the run (TaskFailure, so /api/health and the footer glyph show it, with
// the key in the result) and skips the prune, so a broken week cannot age good copies out. A
// collapse that was deliberate (rows really removed): copy the suspect object to the top level
// to make it the baseline, or just delete it — the next verified week becomes one.

const DATABASE = 'jim-klonow-ski-db'
const PREFIX = `backups/d1/${DATABASE}/`
const SUSPECT = `${PREFIX}suspect/`
/** A quarter's worth of weekly copies. */
const KEEP = 12
/** R2 caps customMetadata at 2 KB; 21 tables of counts are ~500 B, so counts go only while they fit. */
const MAX_COUNTS_CHARS = 1500

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

async function gunzip(body: ReadableStream): Promise<string> {
  return new Response(body.pipeThrough(new DecompressionStream('gzip'))).text()
}

/** The dated top-level backups, oldest first. Keys are dated, so name order is age order; the
 * delimiter keeps suspect/ out. */
async function listBackups(bucket: R2Bucket): Promise<string[]> {
  const listed = await bucket.list({ prefix: PREFIX, delimiter: '/' })
  return listed.objects.map(o => o.key).sort()
}

async function backupDatabase(env: Env) {
  const bucket = env.LABS_BUCKET
  const { backup, rows } = await snapshotDatabase(env.DB, DATABASE)
  const counts = tableCounts(backup)
  const tables = Object.keys(counts).length
  const problems: string[] = []

  // Restorable: the very SQL the restore script would write, so an unsplittable row fails now.
  let statements = 0
  try {
    statements = backupToSqlStatements(backup).length
  }
  catch (err) {
    problems.push(`not restorable: ${errorMessage(err)}`)
  }

  // Against the previous backup.
  const existing = await listBackups(bucket)
  const previousKey = existing.at(-1) ?? null
  const previous = previousKey ? await bucket.head(previousKey) : null
  const collapsed = collapseReport(baselineFrom(previous?.customMetadata), counts)
  problems.push(...collapsed)

  const json = JSON.stringify(backup)
  const body = await gzip(json)
  const key = `${collapsed.length ? SUSPECT : PREFIX}${localToday()}.json.gz`
  const countsJson = JSON.stringify(counts)
  await bucket.put(key, body, {
    httpMetadata: { contentType: 'application/gzip' },
    customMetadata: {
      tables: String(tables),
      rows: String(rows),
      ...(countsJson.length <= MAX_COUNTS_CHARS ? { counts: countsJson } : {})
    }
  })

  // Read back: the object is there and decompresses to exactly what was snapshotted. A truncated
  // gzip throws out of the decompressor; that is a verification failure like any other, not a
  // crash that loses the key.
  try {
    const stored = await bucket.get(key)
    if (!stored) throw new Error('object missing after put')
    if (await gunzip(stored.body) !== json) throw new Error('stored object differs from the snapshot')
  }
  catch (err) {
    problems.push(`read-back: ${errorMessage(err)}`)
  }

  const result = { key, tables, rows, gzip_bytes: body.byteLength, json_chars: json.length, statements, previous: previousKey, pruned: 0 }
  if (problems.length) throw new TaskFailure(`backup written to ${key} but not verified: ${problems.join('; ')}`, result)

  // Prune to the newest KEEP, only now that this one is verified.
  const old = [...existing, key].sort().slice(0, -KEEP)
  if (old.length) await bucket.delete(old)
  return { ...result, pruned: old.length }
}

export default defineTask({
  meta: {
    name: 'db:backup',
    description: 'Snapshot the main D1 database into R2 (gzipped JSON), verify it restores and lost nothing, keep the newest 12'
  },
  run: event => runLoggedTask(event, 'db:backup', backupDatabase)
})
