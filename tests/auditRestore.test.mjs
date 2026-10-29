// The restore write (shared/utils/auditRestore.ts) against the REAL schema in node:sqlite with
// foreign keys on, as D1 runs — audit #43 item 1: reverting a protocol item's edit with
// INSERT OR REPLACE deleted the item first and cascaded away every one of its versions.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { restoreUpsertSql } from '../shared/utils/auditRestore.ts'

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
function protocolDb() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(schema)
  db.exec(`INSERT INTO protocol_items (id, name, kind, category, injected, notes, sort, created_at)
    VALUES (1, 'hCG', 'logged', 'compound', 1, 'edited later', 0, '2026-06-18T00:00:00Z')`)
  db.exec(`INSERT INTO protocol_versions (item_id, from_date, to_date, dose_label, weekdays, created_at) VALUES
    (1, '2026-06-18', '2026-10-23', '300 IU', '[2,5,0]', '2026-06-18T00:00:00Z'),
    (1, '2026-10-24', NULL, '250 IU', '[2,5]', '2026-10-24T00:00:00Z')`)
  return db
}
const versions = db => db.prepare('SELECT COUNT(*) AS n FROM protocol_versions WHERE item_id = 1').get().n
const restore = (db, table, keyCol, row) => {
  const cols = Object.keys(row)
  return db.prepare(restoreUpsertSql(table, keyCol, cols)).run(...cols.map(c => row[c]))
}

test('reverting a protocol item edit puts the old fields back and keeps every version', () => {
  const db = protocolDb()
  // INSERT OR REPLACE is the old write — it really does take the versions (the bug, kept as proof).
  const old = protocolDb()
  old.exec(`INSERT OR REPLACE INTO protocol_items (id, name, kind, category, injected, sort, created_at)
    VALUES (1, 'hCG', 'logged', 'compound', 1, 0, '2026-06-18T00:00:00Z')`)
  assert.equal(versions(old), 0)

  restore(db, 'protocol_items', 'id', { id: 1, name: 'hCG', kind: 'logged', category: 'compound', injected: 1, notes: null, sort: 0, created_at: '2026-06-18T00:00:00Z' })
  assert.equal(versions(db), 2)
  assert.equal(db.prepare('SELECT notes FROM protocol_items WHERE id = 1').get().notes, null)
})

test('a deleted row comes back with its own key', () => {
  const db = protocolDb()
  db.exec('DELETE FROM protocol_versions WHERE dose_label = \'250 IU\'')
  restore(db, 'protocol_versions', 'id', { id: 2, item_id: 1, from_date: '2026-10-24', to_date: null, dose_label: '250 IU', weekdays: '[2,5]', note: null, created_at: '2026-10-24T00:00:00Z' })
  assert.equal(versions(db), 2)
  assert.equal(db.prepare('SELECT dose_label FROM protocol_versions WHERE id = 2').get().dose_label, '250 IU')
})

test('a version whose item is gone fails on the foreign key — the cue for the 409', () => {
  const db = protocolDb()
  db.exec('DELETE FROM protocol_items WHERE id = 1')
  assert.equal(versions(db), 0)
  assert.throws(
    () => restore(db, 'protocol_versions', 'id', { id: 2, item_id: 1, from_date: '2026-10-24', dose_label: '250 IU', weekdays: '[2,5]', created_at: '2026-10-24T00:00:00Z' }),
    /FOREIGN KEY constraint failed/
  )
})

test('text-keyed tables upsert on their key too', () => {
  const db = protocolDb()
  db.exec('INSERT INTO profile (key, value, updated_at) VALUES (\'blood_type\', \'A+\', \'2026-10-01\')')
  restore(db, 'profile', 'key', { key: 'blood_type', value: 'O+', updated_at: '2026-09-01' })
  assert.deepEqual({ ...db.prepare('SELECT value, updated_at FROM profile WHERE key = \'blood_type\'').get() }, { value: 'O+', updated_at: '2026-09-01' })
})

test('a key-only snapshot re-creates a missing row and leaves an existing one alone', () => {
  assert.match(restoreUpsertSql('profile', 'key', ['key']), /ON CONFLICT\(key\) DO NOTHING$/)
})
