// The soda/water undo statement (shared/utils/journalRemove.ts) against the REAL schema in
// node:sqlite — audit #42 item 24: a no-op removal must report zero changes so nothing is audited.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { removeAtSql } from '../shared/utils/journalRemove.ts'

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
function dbWith(column, items) {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  db.prepare(`INSERT INTO journal_entries (date, ${column}) VALUES (?, ?)`).run('2026-10-21', JSON.stringify(items))
  return db
}
const read = (db, column) => JSON.parse(db.prepare(`SELECT ${column} FROM journal_entries WHERE date = ?`).get('2026-10-21')[column])

for (const column of ['sodas', 'water']) {
  test(`${column}: an index inside the list removes that item and counts one change`, () => {
    const db = dbWith(column, [{ time: '09:00' }, { time: '12:00' }, { time: '15:00' }])
    const res = db.prepare(removeAtSql(column)).run('2026-10-21', 1)
    assert.equal(res.changes, 1)
    assert.deepEqual(read(db, column).map(x => x.time), ['09:00', '15:00'])
  })

  test(`${column}: an index past the end changes nothing and counts zero — the audit's cue to stay silent`, () => {
    const db = dbWith(column, [{ time: '09:00' }, { time: '12:00' }])
    const res = db.prepare(removeAtSql(column)).run('2026-10-21', 2)
    assert.equal(res.changes, 0)
    assert.deepEqual(read(db, column).map(x => x.time), ['09:00', '12:00'])
    assert.equal(db.prepare(removeAtSql(column)).run('2026-10-21', 99).changes, 0)
  })

  test(`${column}: an empty list or a day with no row counts zero`, () => {
    const db = dbWith(column, [])
    assert.equal(db.prepare(removeAtSql(column)).run('2026-10-21', 0).changes, 0)
    assert.equal(db.prepare(removeAtSql(column)).run('2026-10-20', 0).changes, 0)
  })
}
