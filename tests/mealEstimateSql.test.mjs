// The two meal_estimates upserts (shared/utils/mealEstimateSql.ts) against the REAL schema in
// node:sqlite: a correction overwrites a model row, a model row never overwrites a correction.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { MEAL_ESTIMATE_AI_UPSERT, MEAL_ESTIMATE_MANUAL_UPSERT } from '../shared/utils/mealEstimateSql.ts'

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
const KEY = 'lasagna veggie'
const read = db => ({ ...db.prepare('SELECT kcal, source, confidence, assumptions, model FROM meal_estimates WHERE key = ?').get(KEY) })

test('a model row lands, a correction overwrites it, a later model row leaves the correction alone', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  db.prepare(MEAL_ESTIMATE_AI_UPSERT).run(KEY, 'veggie lasagna', 700, 30, 70, 32, 'medium', '1 plate', 'test-model', 'hash1', '2026-10-22T00:00:00Z', 900, 6)
  assert.deepEqual(read(db), { kcal: 700, source: 'ai', confidence: 'medium', assumptions: '1 plate', model: 'test-model' })
  const extras = () => ({ ...db.prepare('SELECT sodium_mg, fiber_g FROM meal_estimates WHERE key = ?').get(KEY) })
  assert.deepEqual(extras(), { sodium_mg: 900, fiber_g: 6 }, 'sodium and fibre ride the model row (item 71)')

  // A fresh model estimate replaces an older model estimate.
  db.prepare(MEAL_ESTIMATE_AI_UPSERT).run(KEY, 'veggie lasagna', 720, 31, 71, 33, 'high', '1 plate', 'test-model-2', 'hash2', '2026-10-22T01:00:00Z', 950, 7)
  assert.equal(read(db).kcal, 720)
  assert.deepEqual(extras(), { sodium_mg: 950, fiber_g: 7 })

  // The owner corrects it, leaving sodium blank and entering fibre.
  db.prepare(MEAL_ESTIMATE_MANUAL_UPSERT).run(KEY, 'veggie lasagna', 650, 28, 60, 30, '2026-10-22T02:00:00Z', null, 8, null, null)
  assert.deepEqual(read(db), { kcal: 650, source: 'manual', confidence: 'high', assumptions: 'corrected by hand', model: null })
  assert.deepEqual(extras(), { sodium_mg: null, fiber_g: 8 }, 'a blank is no figure, not the model\'s old one')

  // Looked up by barcode: the row keeps the digits and what they found (migration 0025)…
  const scan = () => ({ ...db.prepare('SELECT barcode, assumptions, source FROM meal_estimates WHERE key = ?').get(KEY) })
  db.prepare(MEAL_ESTIMATE_MANUAL_UPSERT).run(KEY, 'veggie lasagna', 700, 32, 70, 32, '2026-10-22T02:30:00Z', 1340, 4, 'Open Food Facts: Test Lasagna — 2 × 1 cup (240 g)', '0071921702823')
  assert.deepEqual(scan(), { barcode: '0071921702823', assumptions: 'Open Food Facts: Test Lasagna — 2 × 1 cup (240 g)', source: 'manual' })
  // …and a later typed correction drops them: the figures are no longer the barcode's.
  db.prepare(MEAL_ESTIMATE_MANUAL_UPSERT).run(KEY, 'veggie lasagna', 650, 28, 60, 30, '2026-10-22T02:45:00Z', null, 8, null, null)
  assert.deepEqual(scan(), { barcode: null, assumptions: 'corrected by hand', source: 'manual' })

  // A model row for the same key can no longer touch it.
  const res = db.prepare(MEAL_ESTIMATE_AI_UPSERT).run(KEY, 'veggie lasagna', 999, 1, 1, 1, 'low', 'guess', 'test-model-3', 'hash3', '2026-10-22T03:00:00Z', 1, 1)
  assert.equal(res.changes, 0)
  assert.equal(read(db).kcal, 650)
  assert.equal(read(db).source, 'manual')
})

test('a correction on a key with no row creates the manual row outright', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  db.prepare(MEAL_ESTIMATE_MANUAL_UPSERT).run(KEY, 'veggie lasagna', 650, 28, 60, 30, '2026-10-22T02:00:00Z', 1200, null, null, null)
  assert.equal(read(db).source, 'manual')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meal_estimates').get().n, 1)
})
