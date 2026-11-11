// Per-reading provenance (shared/utils/labReadings.ts) — audit #43 item 72: the sanitizer, the
// text helpers, and that a printed bound censors a reading everywhere isCensored is asked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isBoundReading, readingProvenanceText, readingRangeText, readingValueText, sanitizeReadings, usualLab } from '../shared/utils/labReadings.ts'
import { isCensored } from '../shared/utils/labNotes.ts'
import { cellText, ledgerRows } from '../shared/utils/drawLedger.ts'

const KEYS = new Set(['testosterone_total', 'estradiol', 'hematocrit'])
const PDF = '2026-09-09-CHW-LabResults-ab12cd34.pdf'

test('sanitizeReadings: only saved markers, bounded fields, the qualifier one of two, the source one of the row\'s PDFs', () => {
  const out = sanitizeReadings({
    testosterone_total: { qualifier: '>', unit: ' ng/dL ', ref_low: '264', ref_high: 916, lab: 'CHW', assay: 'immunoassay', source: PDF },
    estradiol: { qualifier: '≥', unit: '', ref_low: null, ref_high: 'abc', lab: 'x'.repeat(80), assay: 'LC/MS/MS' },
    hematocrit: { qualifier: '', unit: '%', source: 'evil.pdf' },
    ldl: { lab: 'Quest' }, // not being saved
    cholesterol: 'nope'
  }, KEYS, [PDF], PDF)
  assert.deepEqual(out.testosterone_total, { qualifier: '>', unit: 'ng/dL', ref_low: 264, ref_high: 916, lab: 'CHW', assay: 'immunoassay', source: PDF })
  assert.deepEqual(out.estradiol, { lab: 'x'.repeat(48), assay: 'LC/MS/MS', source: PDF }, 'a bad qualifier and an unparsable range end are dropped; the default source fills in')
  assert.deepEqual(out.hematocrit, { unit: '%', source: PDF }, 'a source not among the row\'s PDFs is replaced by the default')
  assert.equal(out.ldl, undefined)
  assert.equal(out.cholesterol, undefined)
  assert.deepEqual(sanitizeReadings({ hematocrit: { qualifier: '' } }, KEYS, [PDF]), {}, 'nothing left → no entry')
  assert.deepEqual(sanitizeReadings(null, KEYS, [PDF]), {})
})

test('the text helpers: value with its bound, the printed range, the provenance line, the usual lab', () => {
  const ceiling = { qualifier: '>', unit: 'ng/dL', ref_low: 264, ref_high: 916, lab: 'CHW', assay: 'immunoassay' }
  assert.equal(readingValueText(1500, ceiling), '>1500')
  assert.equal(readingValueText(126, { lab: 'Quest' }), '126')
  assert.equal(readingValueText(10, null), '10')
  assert.equal(readingRangeText(ceiling), '264–916')
  assert.equal(readingRangeText({ ref_high: 39 }), '<39')
  assert.equal(readingRangeText({ ref_low: 60 }), '>60')
  assert.equal(readingRangeText({ lab: 'Quest' }), '')
  assert.equal(readingProvenanceText(ceiling), 'CHW · immunoassay · printed range 264–916 ng/dL · at the instrument ceiling — a bound, not a measurement')
  assert.equal(readingProvenanceText({ qualifier: '<', unit: 'pg/mL' }), 'printed in pg/mL · below the instrument floor — a bound, not a measurement')
  assert.equal(readingProvenanceText(null), '')
  const draws = [
    { readings: { hematocrit: { lab: 'Quest' } } },
    { readings: { hematocrit: { lab: 'Quest' } } },
    { readings: { hematocrit: { lab: 'Quest' } } },
    { readings: { hematocrit: { lab: 'CHW' } } },
    { readings: {} }
  ]
  assert.equal(usualLab(draws, 'hematocrit'), 'Quest', '3 of 5 is more than half')
  assert.equal(usualLab(draws.slice(1), 'hematocrit'), null, '2 of 4 is not — no usual lab yet, every known lab is worth naming')
  assert.equal(usualLab([draws[3], ...draws.slice(4)], 'hematocrit'), null, 'one labelled draw among unlabelled ones is not the usual')
  assert.equal(usualLab(draws, 'ldl'), null)
})

test('a printed bound censors the reading: isCensored, and the ledger daggers it with no delta', () => {
  const sep = { date: '2026-09-09', markers: { testosterone_total: 1500, hematocrit: 51.7 }, readings: { testosterone_total: { qualifier: '>', lab: 'CHW' } } }
  assert.equal(isBoundReading(sep, 'testosterone_total'), true)
  assert.equal(isCensored(sep, 'testosterone_total'), true, 'no hand note needed')
  assert.equal(isCensored(sep, 'hematocrit'), false)
  assert.equal(isCensored({ date: 'x', markers: {}, notes: { lh: { date: 'x', note: 'floor', censored: true } } }, 'lh'), true, 'the hand note still censors')
  const rows = ledgerRows([
    { date: '2026-08-15', markers: { testosterone_total: 1180 } },
    sep,
    { date: '2026-10-17', markers: { testosterone_total: 980 } }
  ], [], [])
  assert.equal(cellText(rows[1].cells.testosterone_total), '1500†')
  assert.equal(cellText(rows[0].cells.testosterone_total), '980 (−200)', 'Oct diffs against Aug, not the ceiling')
})
