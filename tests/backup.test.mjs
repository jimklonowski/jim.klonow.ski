// The weekly backup's round trip (shared/utils/backup.ts): rows read out of a real SQLite
// database with the site's schema, turned into the backup format, restored as SQL into a fresh
// database, and read back identical. This is the only rehearsal a restore gets before it's needed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { BACKUP_VERSION, backupToSql, isBackedUpTable, toBackupTable } from '../shared/utils/backup.ts'

const DIR = 'server/database/migrations'
function migrated() {
  const db = new DatabaseSync(':memory:')
  for (const f of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(DIR, f), 'utf8'))
  return db
}

// Plain objects: node:sqlite returns null-prototype rows, which deepEqual treats as different.
const all = (db, sql) => db.prepare(sql).all().map(r => ({ ...r }))

function snapshot(db) {
  const names = all(db, `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).map(t => t.name).filter(isBackedUpTable)
  const tables = {}
  for (const name of names) {
    const columns = all(db, `PRAGMA table_info(${name})`).map(c => c.name)
    tables[name] = toBackupTable(all(db, `SELECT * FROM ${name}`), columns)
  }
  return { version: BACKUP_VERSION, created_at: '2026-09-27T08:00:00.000Z', database: 'test', migrations: ['0001_baseline.sql'], tables }
}

test('a backup restores every row exactly, awkward values included', () => {
  const source = migrated()
  source.exec(`
    INSERT INTO journal_entries (date, weight_lbs, peptides, notes) VALUES
      ('2026-09-20', 181.4, '[{"compound":"HGH","dose":2.5,"unit":"iu"}]', 'Jim''s "rough" night; 2nd line' || char(10) || 'more'),
      ('2026-09-21', NULL, '[]', NULL);
    INSERT INTO supplements (name, dose, notes, sort, created_at) VALUES ('Mg', '400 mg', 'it''s fine -- really', 3, '2026-09-01T00:00:00Z');
    INSERT INTO vials (compound, vial_amount, cost, created_at) VALUES ('BPC-157', 5, 0.1 + 0.2, 'x');
    INSERT INTO whoop_tokens (id, access_token, refresh_token, expires_at) VALUES (1, 'secret', 'secret', 0);
  `)
  const backup = snapshot(source)
  assert.equal('whoop_tokens' in backup.tables, false, 'OAuth tokens never enter a backup')

  const target = migrated()
  // A target with stale rows of its own: the restore replaces them.
  target.exec(`INSERT INTO journal_entries (date) VALUES ('1999-01-01')`)
  target.exec(backupToSql(backup, 1))

  for (const name of Object.keys(backup.tables)) {
    assert.deepEqual(all(target, `SELECT * FROM ${name}`), all(source, `SELECT * FROM ${name}`), name)
  }
  // AUTOINCREMENT carries on past restored ids instead of reusing them.
  target.exec(`INSERT INTO vials (compound, vial_amount, created_at) VALUES ('X', 1, 'y')`)
  assert.equal(target.prepare('SELECT MAX(id) AS m FROM vials').get().m, 2)
})

test('the format refuses what it cannot restore faithfully', () => {
  assert.throws(() => toBackupTable([{ blob: new Uint8Array([1]) }], ['blob']), /unsupported value/)
  assert.throws(() => backupToSql({ version: 99, tables: {} }), /unsupported backup version/)
  assert.throws(() => backupToSql({ version: BACKUP_VERSION, created_at: '', database: '', migrations: [], tables: { 'x; DROP TABLE y': { columns: [], rows: [] } } }), /unsafe identifier/)
})
