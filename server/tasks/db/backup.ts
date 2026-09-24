import { localToday } from '#shared/utils/time'

// Weekly snapshot of the main D1 database into R2 — see shared/utils/backup.ts for the format
// and why Time Travel alone isn't enough. Restore: download the object and run
// scripts/restore-backup.mjs.
//
// Stored in the labs bucket under backups/, which the PDF proxy refuses to serve (isLabPdfKey).
// Only the main DB: the demo sandbox is rebuilt from its seed every night.

const DATABASE = 'jim-klonow-ski-db'
const PREFIX = `backups/d1/${DATABASE}/`
/** A quarter's worth of weekly copies. */
const KEEP = 12

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

async function backupDatabase(env: Env) {
  const { backup, rows } = await snapshotDatabase(env.DB, DATABASE)
  const tables = Object.keys(backup.tables).length

  const json = JSON.stringify(backup)
  const body = await gzip(json)
  const key = `${PREFIX}${localToday()}.json.gz`
  await env.LABS_BUCKET.put(key, body, {
    httpMetadata: { contentType: 'application/gzip' },
    customMetadata: { tables: String(tables), rows: String(rows) }
  })

  // Prune to the newest KEEP. Keys are dated, so name order is age order.
  const listed = await env.LABS_BUCKET.list({ prefix: PREFIX })
  const old = listed.objects.map(o => o.key).sort().slice(0, -KEEP)
  if (old.length) await env.LABS_BUCKET.delete(old)

  return { key, tables, rows, gzip_bytes: body.byteLength, json_chars: json.length, pruned: old.length }
}

export default defineTask({
  meta: {
    name: 'db:backup',
    description: 'Snapshot the main D1 database into R2 (gzipped JSON), keeping the newest 12'
  },
  run: event => runLoggedTask(event, 'db:backup', backupDatabase)
})
