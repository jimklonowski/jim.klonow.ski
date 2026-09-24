import { BACKUP_VERSION, isBackedUpTable, toBackupTable, type Backup } from '#shared/utils/backup'
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
  const db = env.DB
  const { results: tableRows } = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all<{ name: string }>()
  const names = (tableRows ?? []).map(t => t.name).filter(isBackedUpTable)

  const { results: applied } = await db
    .prepare('SELECT name FROM d1_migrations ORDER BY id')
    .all<{ name: string }>()
    .catch(() => ({ results: [] as { name: string }[] }))

  const backup: Backup = {
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    database: DATABASE,
    migrations: (applied ?? []).map(m => m.name),
    tables: {}
  }
  let rows = 0
  for (const name of names) {
    // Column order from the schema, so an empty table still records its shape.
    const { results: info } = await db.prepare(`PRAGMA table_info(${name})`).all<{ name: string }>()
    const { results } = await db.prepare(`SELECT * FROM ${name}`).all<Record<string, unknown>>()
    backup.tables[name] = toBackupTable(results ?? [], (info ?? []).map(c => c.name))
    rows += results?.length ?? 0
  }

  const json = JSON.stringify(backup)
  const body = await gzip(json)
  const key = `${PREFIX}${localToday()}.json.gz`
  await env.LABS_BUCKET.put(key, body, {
    httpMetadata: { contentType: 'application/gzip' },
    customMetadata: { tables: String(names.length), rows: String(rows) }
  })

  // Prune to the newest KEEP. Keys are dated, so name order is age order.
  const listed = await env.LABS_BUCKET.list({ prefix: PREFIX })
  const old = listed.objects.map(o => o.key).sort().slice(0, -KEEP)
  if (old.length) await env.LABS_BUCKET.delete(old)

  return { key, tables: names.length, rows, gzip_bytes: body.byteLength, json_chars: json.length, pruned: old.length }
}

export default defineTask({
  meta: {
    name: 'db:backup',
    description: 'Snapshot the main D1 database into R2 (gzipped JSON), keeping the newest 12'
  },
  run: event => runLoggedTask(event, 'db:backup', backupDatabase)
})
