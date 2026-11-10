// The one-time estradiol assay split (server/database/fix-estradiol-assays-2026-11-10.sql),
// audit #43 item 65 — proved in node:sqlite against the real schema before it touches prod.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
const fix = readFileSync(new URL('../server/database/fix-estradiol-assays-2026-11-10.sql', import.meta.url), 'utf8')

function dbWith(rows) {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  const insert = db.prepare('INSERT INTO labs_entries (date, fasting, sources, markers, qualitative) VALUES (?, 1, ?, ?, ?)')
  for (const [date, markers] of rows) insert.run(date, '[]', JSON.stringify(markers), '[]')
  return db
}
const read = (db, date) => {
  const row = db.prepare('SELECT markers FROM labs_entries WHERE date = ?').get(date)
  const m = JSON.parse(row.markers)
  return [m.estradiol ?? null, m.estradiol_sensitive ?? null, m.hematocrit ?? null]
}

test('splits both draws whichever report won the merge, keeps the other markers, and is a no-op the second time', () => {
  const db = dbWith([
    ['2026-08-15', { estradiol: 106, hematocrit: 50.4 }], // the add-on was uploaded last
    ['2026-10-17', { estradiol: 157, hematocrit: 51.7 }], // the panel was uploaded last
    ['2026-09-09', { estradiol: 90, hematocrit: 51.7 }] // not one of the pair: untouched
  ])
  db.exec(fix)
  assert.deepEqual(read(db, '2026-08-15'), [85, 106, 50.4])
  assert.deepEqual(read(db, '2026-10-17'), [157, 126, 51.7])
  assert.deepEqual(read(db, '2026-09-09'), [90, null, 51.7])
  db.exec(fix)
  assert.deepEqual(read(db, '2026-08-15'), [85, 106, 50.4], 'idempotent')
  assert.deepEqual(read(db, '2026-10-17'), [157, 126, 51.7], 'idempotent')
})

test('the Oct 17 row split correctly when the add-on had won (126, or the 127 once noted), and a hand-edited row is left alone', () => {
  for (const won of [126, 127]) {
    const db = dbWith([['2026-10-17', { estradiol: won }]])
    db.exec(fix)
    assert.deepEqual(read(db, '2026-10-17'), [157, 126, null], `add-on value ${won}`)
  }
  const edited = dbWith([['2026-08-15', { estradiol: 85, estradiol_sensitive: 110 }]])
  edited.exec(fix)
  assert.deepEqual(read(edited, '2026-08-15'), [85, 110, null], 'a row that already has the sensitive key is not rewritten')
  const other = dbWith([['2026-08-15', { estradiol: 99 }]])
  other.exec(fix)
  assert.deepEqual(read(other, '2026-08-15'), [99, null, null], 'an unexpected value is not overwritten')
})
