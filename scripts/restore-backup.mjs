#!/usr/bin/env node
// Turns a weekly D1 backup (server/tasks/db/backup.ts) back into SQL:
//
//   npx wrangler r2 object get jim-klonow-ski-labs/backups/d1/jim-klonow-ski-db/<date>.json.gz --remote --file <tmp>/backup.json.gz
//   node scripts/restore-backup.mjs <tmp>/backup.json.gz <tmp>/restore.sql   (or an /api/export .json)
//   npx wrangler d1 execute jim-klonow-ski-db --local --file <tmp>/restore.sql
//
// The SQL replaces each backed-up table's rows (DELETE + INSERT), so run it against a database
// already at the backup's schema: `pnpm db:migrate` builds one, and the header of the output
// names the migrations the source had applied. Rehearse on --local before ever pointing it at
// --remote. The backup is the whole health history in plaintext once unzipped — keep both files
// out of the repo (it's public) and delete them when done.
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { backupToSql } from '../shared/utils/backup.ts'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('Usage: node scripts/restore-backup.mjs <backup.json.gz> <restore.sql>')
  process.exit(1)
}

// The weekly backup is gzipped; the owner's /api/export download is the same JSON uncompressed.
const raw = readFileSync(input)
const isGzip = raw[0] === 0x1F && raw[1] === 0x8B
const backup = JSON.parse((isGzip ? gunzipSync(raw) : raw).toString('utf8'))
writeFileSync(output, backupToSql(backup))

const counts = Object.entries(backup.tables).map(([name, t]) => `${name} ${t.rows.length}`).join(', ')
console.log(`${backup.database} as of ${backup.created_at} → ${output}`)
console.log(`  ${counts}`)
console.log(`  schema: ${backup.migrations.join(', ') || 'unknown'}`)
