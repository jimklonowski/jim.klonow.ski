// The health webhook's per-date upsert (shared/utils/vitalsUpsert.ts) against the REAL schema
// (server/database/schema.sql) in node:sqlite — audit #42 item 6: a row created by a quick-add
// between the webhook's read and write used to be a primary-key failure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { VITALS_SELECT, VITALS_UPSERT_SQL, VITAL_FIELDS, vitalsBindings, vitalsOutcome } from '../shared/utils/vitalsUpsert.ts'

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
function fresh() {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  return db
}
// node:sqlite rows have a null prototype; spread them so strict deep-equal compares values only.
const plain = row => (row ? { ...row } : row)
const upsert = (db, date, vitals) => plain(db.prepare(VITALS_UPSERT_SQL).get(...vitalsBindings(date, vitals)))
const read = (db, date) => plain(db.prepare(`SELECT ${VITALS_SELECT}, sodas, water, food, peptides FROM journal_entries WHERE date = ?`).get(date))

test('a new date is created with its vitals and the table defaults, and reports as created', () => {
  const db = fresh()
  const after = upsert(db, '2026-10-20', { weight_lbs: 170.2, rhr: 55 })
  assert.deepEqual(after, { date: '2026-10-20', weight_lbs: 170.2, rhr: 55, hrv: null, bp_systolic: null, bp_diastolic: null })
  const row = read(db, '2026-10-20')
  assert.equal(row.sodas, '[]')
  assert.equal(row.water, '[]')
  assert.equal(row.food, '{}')
  assert.equal(row.peptides, '[]')
  assert.equal(vitalsOutcome(undefined, after), 'created')
})

test('a row a quick-add created first is filled, not fought over — and its soda survives', () => {
  const db = fresh()
  // soda.post.ts's statement: the row exists with a soda and no vitals when the webhook arrives.
  db.prepare(`INSERT INTO journal_entries (date, sodas) VALUES (?1, json_array(json(?2)))
    ON CONFLICT(date) DO UPDATE SET sodas = json_insert(sodas, '$[#]', json(?2))`).run('2026-10-21', '{"time":"09:10"}')
  const before = plain(db.prepare(`SELECT ${VITALS_SELECT} FROM journal_entries WHERE date = ?`).get('2026-10-21'))
  const after = upsert(db, '2026-10-21', { weight_lbs: 169.8, hrv: 61 })
  assert.deepEqual(after, { date: '2026-10-21', weight_lbs: 169.8, rhr: null, hrv: 61, bp_systolic: null, bp_diastolic: null })
  assert.equal(JSON.parse(read(db, '2026-10-21').sodas).length, 1)
  assert.equal(vitalsOutcome(before, after), 'updated')
})

test('a reading already on the row is never overwritten; only blanks take the webhook value', () => {
  const db = fresh()
  db.prepare('INSERT INTO journal_entries (date, weight_lbs, bp_systolic, bp_diastolic) VALUES (?, ?, ?, ?)').run('2026-10-19', 171.0, 124, 78)
  const before = plain(db.prepare(`SELECT ${VITALS_SELECT} FROM journal_entries WHERE date = ?`).get('2026-10-19'))
  const after = upsert(db, '2026-10-19', { weight_lbs: 168.0, rhr: 54, bp_systolic: 130 })
  assert.equal(after.weight_lbs, 171.0, 'the manual weigh-in stays')
  assert.equal(after.bp_systolic, 124)
  assert.equal(after.rhr, 54, 'the blank is filled')
  assert.equal(vitalsOutcome(before, after), 'updated')
  // The same delivery again changes nothing.
  const again = upsert(db, '2026-10-19', { weight_lbs: 168.0, rhr: 54, bp_systolic: 130 })
  assert.deepEqual(again, after)
  assert.equal(vitalsOutcome(after, again), 'unchanged')
})

test('a vital the delivery lacks binds as null and clears nothing', () => {
  const db = fresh()
  upsert(db, '2026-10-18', { weight_lbs: 170, rhr: 56, hrv: 60, bp_systolic: 120, bp_diastolic: 80 })
  const after = upsert(db, '2026-10-18', {})
  assert.deepEqual(vitalsBindings('2026-10-18', {}), ['2026-10-18', null, null, null, null, null])
  for (const f of VITAL_FIELDS) assert.notEqual(after[f], null, f)
})

test('the same date written twice in one batch is fine (two points for one day in a delivery)', () => {
  const db = fresh()
  const a = upsert(db, '2026-10-17', { rhr: 57 })
  const b = upsert(db, '2026-10-17', { hrv: 58 })
  assert.deepEqual(b, { ...a, hrv: 58 })
})
