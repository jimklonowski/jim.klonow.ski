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
  db.prepare(MEAL_ESTIMATE_AI_UPSERT).run(KEY, 'veggie lasagna', 700, 30, 70, 32, 'medium', '1 plate', 'test-model', 'hash1', '2026-10-22T00:00:00Z')
  assert.deepEqual(read(db), { kcal: 700, source: 'ai', confidence: 'medium', assumptions: '1 plate', model: 'test-model' })

  // A fresh model estimate replaces an older model estimate.
  db.prepare(MEAL_ESTIMATE_AI_UPSERT).run(KEY, 'veggie lasagna', 720, 31, 71, 33, 'high', '1 plate', 'test-model-2', 'hash2', '2026-10-22T01:00:00Z')
  assert.equal(read(db).kcal, 720)

  // The owner corrects it.
  db.prepare(MEAL_ESTIMATE_MANUAL_UPSERT).run(KEY, 'veggie lasagna', 650, 28, 60, 30, '2026-10-22T02:00:00Z')
  assert.deepEqual(read(db), { kcal: 650, source: 'manual', confidence: 'high', assumptions: 'corrected by hand', model: null })

  // A model row for the same key can no longer touch it.
  const res = db.prepare(MEAL_ESTIMATE_AI_UPSERT).run(KEY, 'veggie lasagna', 999, 1, 1, 1, 'low', 'guess', 'test-model-3', 'hash3', '2026-10-22T03:00:00Z')
  assert.equal(res.changes, 0)
  assert.equal(read(db).kcal, 650)
  assert.equal(read(db).source, 'manual')
})

test('a correction on a key with no row creates the manual row outright', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  db.prepare(MEAL_ESTIMATE_MANUAL_UPSERT).run(KEY, 'veggie lasagna', 650, 28, 60, 30, '2026-10-22T02:00:00Z')
  assert.equal(read(db).source, 'manual')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meal_estimates').get().n, 1)
})
