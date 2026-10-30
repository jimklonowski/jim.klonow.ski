// TierMeter's band rule (app/utils/meterBands.ts) — audit #43 item 30: a reading exactly on a cutoff.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bandTone } from '../app/utils/meterBands.ts'

const AG = [{ from: 0.4, to: 1, tone: 'good' }, { from: 1, to: 1.4, tone: 'warn' }]
const T_SCORE = [{ from: -3.5, to: -2.5, tone: 'danger', inclusiveTo: true }, { from: -2.5, to: -1, tone: 'warn' }, { from: -1, to: 1.5, tone: 'good' }]

test('a cutoff belongs to the band above it by default — "under 1.0 is optimal"', () => {
  assert.equal(bandTone(0.99, AG), 'good')
  assert.equal(bandTone(1, AG), 'warn')
  assert.equal(bandTone(2, AG), 'warn', 'past the last band reads as the last band')
  assert.equal(bandTone(0.1, AG), 'good', 'below the first reads as the first')
  assert.equal(bandTone(null, AG), 'neutral')
})

test('the WHO T-score scale: −2.5 or lower is osteoporosis, −1.0 is normal', () => {
  assert.equal(bandTone(-2.5, T_SCORE), 'danger')
  assert.equal(bandTone(-2.4, T_SCORE), 'warn')
  assert.equal(bandTone(-1.1, T_SCORE), 'warn')
  assert.equal(bandTone(-1, T_SCORE), 'good')
  assert.equal(bandTone(-3, T_SCORE), 'danger')
})
