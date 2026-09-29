#!/usr/bin/env node
// Turns a weekly D1 backup (server/tasks/db/backup.ts) back into SQL:
//
//   npx wrangler r2 object get jim-klonow-ski-labs/backups/d1/jim-klonow-ski-db/<date>.json.gz --remote --file <tmp>/backup.json.gz
//   node scripts/restore-backup.mjs <tmp>/backup.json.gz <tmp>/restore.sql --drill
//   npx wrangler d1 execute jim-klonow-ski-db --local --file <tmp>/restore.sql
//
// The SQL replaces each backed-up table's rows in two phases — every DELETE first (children
// before parents), then every INSERT (parents before children) — so foreign keys and ON DELETE
// CASCADE hold statement by statement, and each INSERT stays under D1's 100 KB statement cap.
// The one exception is `invites`, which is merged rather than wiped: a restore can never
// resurrect a share link revoked after the backup, hand a spent link its uses back, or kill a
// link minted since (shared/utils/backup.ts).
//
// `--drill` rehearses the SQL immediately: a scratch in-memory SQLite is built from
// server/database/migrations (foreign keys ON, like D1), the file is applied, and per-table row
// counts are checked against the backup. Run it every time — it costs a second and it is the
// difference between "the file exists" and "the file restores". Then run it against a database
// already at the backup's schema: `pnpm db:migrate` builds one, and the header of the output
// names the migrations the source had applied. Rehearse on --local before ever pointing it at
// --remote. The backup is the whole health history in plaintext once unzipped — keep both files
// out of the repo (it's public) and delete them when done.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { backupToSql } from '../shared/utils/backup.ts'

const args = process.argv.slice(2)
const drill = args.includes('--drill')
const [input, output] = args.filter(a => a !== '--drill')
if (!input || !output) {
  console.error('Usage: node scripts/restore-backup.mjs <backup.json.gz> <restore.sql> [--drill]')
  process.exit(1)
}

// The weekly backup is gzipped; the owner's /api/export download is the same JSON uncompressed.
const raw = readFileSync(input)
const isGzip = raw[0] === 0x1F && raw[1] === 0x8B
const backup = JSON.parse((isGzip ? gunzipSync(raw) : raw).toString('utf8'))
const sql = backupToSql(backup)
writeFileSync(output, sql)

const counts = Object.entries(backup.tables).map(([name, t]) => `${name} ${t.rows.length}`).join(', ')
console.log(`${backup.database} as of ${backup.created_at} → ${output}`)
console.log(`  ${counts}`)
console.log(`  schema: ${backup.migrations.join(', ') || 'unknown'}`)

if (drill) {
  const { DatabaseSync } = await import('node:sqlite')
  const DIR = 'server/database/migrations'
  const local = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
  const missing = (backup.migrations ?? []).filter(m => !local.includes(m))
  const newer = local.filter(m => !(backup.migrations ?? []).includes(m))
  if (missing.length) console.warn(`  ⚠ backup lists migrations this checkout lacks: ${missing.join(', ')}`)
  if (newer.length) console.log(`  drill schema is newer than the backup by: ${newer.join(', ')} (fine — inserts name their columns)`)

  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const f of local) db.exec(readFileSync(join(DIR, f), 'utf8'))
  try {
    db.exec(sql)
  }
  catch (err) {
    console.error(`  ✗ drill failed applying the SQL: ${err.message}`)
    process.exit(1)
  }
  let bad = 0
  for (const [name, t] of Object.entries(backup.tables)) {
    const got = db.prepare(`SELECT COUNT(*) AS c FROM ${name}`).get().c
    if (got !== t.rows.length) {
      console.error(`  ✗ ${name}: restored ${got} rows, backup holds ${t.rows.length}`)
      bad++
    }
  }
  if (bad) process.exit(1)
  console.log(`  ✓ drill: every table restored to its backed-up row count in a fresh schema, foreign keys enforced`)
}
