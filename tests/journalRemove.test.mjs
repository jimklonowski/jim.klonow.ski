// The soda/water undo statement (shared/utils/journalRemove.ts) against the REAL schema in
// node:sqlite — audit #42 item 24: a no-op removal must report zero changes so nothing is audited.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expectedBindings, removeAtSql, removeExpectedSql } from '../shared/utils/journalRemove.ts'

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

// Audit #43 item 18: a stale second device's index must not take a different entry.
test('sodas: the index removes only the entry the widget saw there', () => {
  const list = [{ time: '09:00', drink: 'Dr Pepper', size: '12oz can' }, { time: '12:00', drink: 'Coke' }, { time: '15:00', drink: 'Coke', size: '12oz can' }]
  const db = dbWith('sodas', list)
  const sql = removeExpectedSql('sodas')
  // The phone removed 09:00; the laptop still shows it at index 0 → its ✕ must not take 12:00.
  db.prepare(removeAtSql('sodas')).run('2026-10-21', 0)
  assert.equal(db.prepare(sql).run('2026-10-21', 0, ...expectedBindings(list[0])).changes, 0)
  assert.deepEqual(read(db, 'sodas').map(x => x.time), ['12:00', '15:00'])
  // A missing size matches as '' — the entry as the widget holds it.
  assert.equal(db.prepare(sql).run('2026-10-21', 0, ...expectedBindings(list[1])).changes, 1)
  assert.deepEqual(read(db, 'sodas').map(x => x.time), ['15:00'])
})

test('water: a volume stored as a float still matches its integer reading', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  // json_object with a REAL bind stores 12.0 — what the widget reads back is 12.
  db.prepare('INSERT INTO journal_entries (date, water) VALUES (?, json_array(json_object(\'time\', \'09:00\', \'oz\', CAST(? AS REAL)), json_object(\'time\', \'10:00\', \'oz\', 8)))').run('2026-10-21', 12)
  const sql = removeExpectedSql('water')
  assert.equal(db.prepare(sql).run('2026-10-21', 0, ...expectedBindings({ time: '09:00', oz: 8 })).changes, 0, 'wrong volume')
  assert.equal(db.prepare(sql).run('2026-10-21', 0, ...expectedBindings({ time: '10:00', oz: 12 })).changes, 0, 'wrong time')
  assert.equal(db.prepare(sql).run('2026-10-21', 0, ...expectedBindings({ time: '09:00', oz: 12 })).changes, 1)
  assert.deepEqual(read(db, 'water'), [{ time: '10:00', oz: 8 }])
})
