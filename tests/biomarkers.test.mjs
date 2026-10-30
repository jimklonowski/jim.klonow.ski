// Derived markers (app/data/biomarkers.ts computeMarkers) — computed at read time, never stored.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMarkers } from '../app/data/biomarkers.ts'

const panel = { glucose: 90, insulin: 9, triglycerides: 80, hdl: 50, cholesterol: 180, ldl: 100 }

test('a fasting draw gets every derived marker its inputs allow', () => {
  const m = computeMarkers(panel, true)
  assert.equal(m.homa_ir, 2) // 90 × 9 / 405
  assert.equal(m.trig_hdl_ratio, 1.6)
  assert.equal(m.remnant_cholesterol, 30)
})

test('HOMA-IR is a fasting index — a non-fasting draw gets none (audit #43 item 14)', () => {
  const m = computeMarkers(panel, false)
  assert.equal(m.homa_ir, undefined)
  // Trig/HDL stays: older CHW panels print no fasting line, so "non-fasting" there is often unknown.
  assert.equal(m.trig_hdl_ratio, 1.6)
})

test('a reported value is never overwritten by a computed one', () => {
  assert.equal(computeMarkers({ ...panel, homa_ir: 1.1 }, true).homa_ir, 1.1)
  assert.equal(computeMarkers({ ...panel, homa_ir: 1.1 }, false).homa_ir, 1.1)
})

test('nothing is derived from a censored reading (audit #43 item 15)', () => {
  const t = { testosterone_total: 1500, testosterone_free: 250 }
  // 2026-09-09: the CHW immunoassay ceiling — free T % over a bound is not a measurement.
  assert.equal(computeMarkers(t, true, '2026-09-09').free_t_pct, undefined)
  assert.equal(computeMarkers(t, true, '2026-08-15').free_t_pct, 1.67)
  assert.equal(computeMarkers(t, true).free_t_pct, 1.67, 'no date, no caveat lookup')
})
