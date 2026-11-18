// One estradiol, two assays (shared/utils/estradiol.ts) — audit #44 item 20 and the single card.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  E2_IMMUNOASSAY, E2_SENSITIVE, actionableEstradiol, estradiolKeyOn, foldAssays, foldCurrent, isEstradiolKey, slotKeyOn, slotLabel
} from '../shared/utils/estradiol.ts'
import { currentReadings, drawFlags } from '../shared/utils/labsTimeline.ts'
import { RETEST_RULES, markersDue } from '../shared/utils/retest.ts'
import { BIOMARKERS } from '../app/data/biomarkers.ts'

const draw = (date, markers) => ({ date, markers })

test('a draw\'s estradiol is its LC/MS/MS reading when it has one, else the immunoassay', () => {
  assert.deepEqual(actionableEstradiol(draw('d', { estradiol: 157, estradiol_sensitive: 126 })), { key: E2_SENSITIVE, assay: 'sensitive', value: 126 })
  assert.deepEqual(actionableEstradiol(draw('d', { estradiol: 57 })), { key: E2_IMMUNOASSAY, assay: 'immunoassay', value: 57 })
  assert.deepEqual(actionableEstradiol(draw('d', { estradiol_sensitive: 110 })), { key: E2_SENSITIVE, assay: 'sensitive', value: 110 })
  assert.equal(actionableEstradiol(draw('d', { hematocrit: 50 })), null)
  assert.equal(actionableEstradiol(draw('d', { estradiol: null, estradiol_sensitive: null })), null, 'a printed line without a figure is no reading')
  assert.equal(estradiolKeyOn(draw('d', { estradiol: 30, estradiol_sensitive: null })), E2_IMMUNOASSAY)
  assert.equal(estradiolKeyOn(null), null)
})

test('either key names the one slot; every other marker is itself', () => {
  const both = draw('d', { estradiol: 157, estradiol_sensitive: 126, hematocrit: 51 })
  assert.equal(slotKeyOn('estradiol', both), E2_SENSITIVE)
  assert.equal(slotKeyOn('estradiol_sensitive', draw('d', { estradiol: 57 })), E2_IMMUNOASSAY)
  assert.equal(slotKeyOn('estradiol', draw('d', {})), 'estradiol', 'no estradiol on the draw: the key asked for, which reads blank')
  assert.equal(slotKeyOn('hematocrit', both), 'hematocrit')
  assert.ok(isEstradiolKey('estradiol') && isEstradiolKey('estradiol_sensitive') && !isEstradiolKey('estrone'))
  assert.equal(slotLabel('estradiol_sensitive', 'Estradiol (sensitive)'), 'Estradiol')
  assert.equal(slotLabel('estradiol', 'Estradiol'), 'Estradiol')
  assert.equal(slotLabel('ferritin', 'Ferritin'), 'Ferritin')
})

test('one sample run by both assays is one reading and one flag', () => {
  const markers = { estradiol: 157, estradiol_sensitive: 126, hematocrit: 51.7 }
  assert.deepEqual(foldAssays(markers), { estradiol_sensitive: 126, hematocrit: 51.7 })
  assert.deepEqual(markers, { estradiol: 157, estradiol_sensitive: 126, hematocrit: 51.7 }, 'the record is left alone')
  const alone = { estradiol: 57, hematocrit: 50 }
  assert.equal(foldAssays(alone), alone, 'an immunoassay-only draw keeps its reading')
  // Both assays are over range: two HIGH flags before, one after — and judged on the LC/MS/MS range.
  assert.deepEqual(drawFlags(markers, BIOMARKERS), { high: 3, low: 0, count: 3 })
  assert.deepEqual(drawFlags(foldAssays(markers), BIOMARKERS), { high: 2, low: 0, count: 2 })
})

test('the current estradiol across draws: the newer reading, and the LC/MS/MS on a shared draw', () => {
  const shared = currentReadings([draw('2026-10-17', { estradiol: 157, estradiol_sensitive: 126 }), draw('2026-08-15', { estradiol: 85 })])
  assert.deepEqual([...foldCurrent(shared).keys()], [E2_SENSITIVE])
  assert.equal(shared.size, 2, 'the input map is left alone')
  // A newer panel with only the immunoassay: that is the current estradiol.
  const newerPanel = currentReadings([draw('2026-11-20', { estradiol: 140 }), draw('2026-10-17', { estradiol: 157, estradiol_sensitive: 126 })])
  assert.deepEqual([...foldCurrent(newerPanel).entries()], [[E2_IMMUNOASSAY, { value: 140, date: '2026-11-20' }]])
  // A newer add-on with only the LC/MS/MS.
  const newerAddOn = currentReadings([draw('2026-11-20', { estradiol_sensitive: 118 }), draw('2026-10-17', { estradiol: 157 })])
  assert.deepEqual([...foldCurrent(newerAddOn).keys()], [E2_SENSITIVE])
  const other = new Map([['hematocrit', { value: 51, date: '2026-10-17' }]])
  assert.deepEqual([...foldCurrent(other).entries()], [...other.entries()])
})

test('the two assays run one retest clock, restarted by the newest draw that read either', () => {
  const TODAY = '2026-12-20'
  // The immunoassay was last run Aug 15; the add-on alone on Nov 20. Its own clock had the
  // immunoassay 37 days overdue for good; the pair is not due until Feb.
  const addOnOnly = [draw('2026-08-15', { estradiol: 85 }), draw('2026-11-20', { estradiol_sensitive: 118 })]
  assert.deepEqual(markersDue(addOnOnly, [], TODAY).map(d => d.key), [])
  // Both last run Sep 1: one entry, the LC/MS/MS, not two.
  const both = [draw('2026-09-01', { estradiol: 157, estradiol_sensitive: 126 })]
  const due = markersDue(both, [], TODAY)
  assert.deepEqual(due.map(d => [d.key, d.due, d.last.value]), [[E2_SENSITIVE, '2026-11-30', 126]])
  // The panel alone, last: the immunoassay's reading starts the clock.
  const panelLast = [draw('2026-06-01', { estradiol_sensitive: 100 }), draw('2026-09-01', { estradiol: 90 })]
  assert.deepEqual(markersDue(panelLast, [], TODAY).map(d => [d.key, d.last.date]), [[E2_IMMUNOASSAY, '2026-09-01']])
  assert.ok(RETEST_RULES[E2_SENSITIVE] && RETEST_RULES[E2_IMMUNOASSAY], 'both assays keep a rule')
})
