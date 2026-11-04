// MEASURED_MARKERS_SQL (shared/utils/labsTimeline.ts) on the real schema in node:sqlite — the
// ⌘K palette lists only markers some draw has measured (audit #43 item 51).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { MEASURED_MARKERS_SQL } from '../shared/utils/labsTimeline.ts'

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')

test('every key with a value on any draw, once, in order; a null figure and an empty draw count for nothing', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  const insert = db.prepare('INSERT INTO labs_entries (date, fasting, markers, qualitative, sources) VALUES (?, 1, ?, ?, ?)')
  insert.run('2024-09-26', JSON.stringify({ hematocrit: 49.1, ferritin: 22, psa: null }), '[]', '[]')
  insert.run('2026-08-15', JSON.stringify({ hematocrit: 51.7, testosterone_total: 2211, estradiol: 106 }), '[]', '[]')
  insert.run('2026-10-17', JSON.stringify({ hematocrit: 51.7, prolactin: 7.1 }), '[]', '[]')
  // An echo row: findings only, no markers.
  insert.run('2025-09-05', '{}', JSON.stringify([{ name: 'LV size', result: 'normal' }]), '[]')
  const keys = db.prepare(MEASURED_MARKERS_SQL).all().map(r => r.key)
  assert.deepEqual(keys, ['estradiol', 'ferritin', 'hematocrit', 'prolactin', 'testosterone_total'])
  assert.ok(!keys.includes('psa'), 'a line printed without a figure was never measured')
})

test('no draws, no keys', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  assert.deepEqual(db.prepare(MEASURED_MARKERS_SQL).all(), [])
})
