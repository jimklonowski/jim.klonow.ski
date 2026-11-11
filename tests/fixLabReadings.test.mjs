// The provenance backfill (server/database/fix-lab-readings-2026-11-11.sql), audit #43 item 72 —
// proved in node:sqlite against the real schema (which has the 0021 column) before prod.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
const fix = readFileSync(new URL('../server/database/fix-lab-readings-2026-11-11.sql', import.meta.url), 'utf8')

function dbWith(rows) {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  const insert = db.prepare('INSERT INTO labs_entries (date, fasting, sources, markers, qualitative, readings) VALUES (?, 1, ?, ?, ?, ?)')
  for (const [date, markers, readings = null] of rows) insert.run(date, '[]', JSON.stringify(markers), '[]', readings ? JSON.stringify(readings) : null)
  return db
}
const readings = (db, date) => JSON.parse(db.prepare('SELECT readings FROM labs_entries WHERE date = ?').get(date).readings ?? '{}')

test('writes the three known provenances, keeps what is already there, and is a no-op the second time', () => {
  const db = dbWith([
    ['2026-08-15', { estradiol: 85, estradiol_sensitive: 106, hematocrit: 50.4 }],
    ['2026-09-09', { testosterone_total: 1500, hematocrit: 51.7 }],
    ['2026-10-17', { estradiol: 157, estradiol_sensitive: 126 }, { ldl: { lab: 'Quest' } }],
    ['2026-07-01', { estradiol: 70 }] // not one of the dates: untouched
  ])
  db.exec(fix)
  assert.deepEqual(readings(db, '2026-09-09'), { testosterone_total: { qualifier: '>', unit: 'ng/dL', ref_low: 264, ref_high: 916, lab: 'CHW', assay: 'immunoassay' } })
  assert.deepEqual(Object.keys(readings(db, '2026-08-15')).sort(), ['estradiol', 'estradiol_sensitive'])
  assert.equal(readings(db, '2026-08-15').estradiol_sensitive.assay, 'LC/MS/MS')
  assert.deepEqual(Object.keys(readings(db, '2026-10-17')).sort(), ['estradiol', 'estradiol_sensitive', 'ldl'], 'an existing key is kept')
  assert.deepEqual(readings(db, '2026-07-01'), {})
  const before = JSON.stringify([readings(db, '2026-08-15'), readings(db, '2026-09-09'), readings(db, '2026-10-17')])
  db.exec(fix)
  assert.equal(JSON.stringify([readings(db, '2026-08-15'), readings(db, '2026-09-09'), readings(db, '2026-10-17')]), before, 'idempotent')
})

test('a Sep 9 row whose T is not the 1500 ceiling, or a pair not yet split, is left alone', () => {
  const db = dbWith([
    ['2026-09-09', { testosterone_total: 980 }],
    ['2026-08-15', { estradiol: 106 }] // not split: only the immunoassay key is written
  ])
  db.exec(fix)
  assert.deepEqual(readings(db, '2026-09-09'), {})
  assert.deepEqual(Object.keys(readings(db, '2026-08-15')), ['estradiol'])
})
