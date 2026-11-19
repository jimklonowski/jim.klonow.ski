// Per-reading provenance (shared/utils/labReadings.ts) — audit #43 item 72: the sanitizer, the
// text helpers, and that a printed bound censors a reading everywhere isCensored is asked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isBoundReading, printedRangeNote, readingProvenanceText, readingRangeText, readingValueText, sanitizeReadings, unitKey, usualLab } from '../shared/utils/labReadings.ts'
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

// Audit #44 item 25: the clinical summary's Reference column is the range the status was judged
// on; what the lab itself printed is a note, and only where it says something different.
test('the lab\'s own range beside the judged one: quoted where it differs, "inside" only for a measured value in the same unit', () => {
  const FERRITIN = { unit: 'ng/mL', refMin: 38, refMax: 380 }
  assert.equal(printedRangeNote(35, { ref_low: 30, ref_high: 400, unit: 'ng/mL', lab: 'CHW' }, FERRITIN), 'inside the lab\'s own range, 30–400 ng/mL', 'LOW on the site\'s range, in range on the lab\'s')
  assert.equal(printedRangeNote(22, { ref_low: 30, ref_high: 400, unit: 'ng/mL' }, FERRITIN), 'lab\'s own range 30–400 ng/mL', 'outside both: quoted, nothing claimed')
  assert.equal(printedRangeNote(35, { ref_low: 38, ref_high: 380, unit: 'ng/mL' }, FERRITIN), '', 'the same range says nothing new')
  assert.equal(printedRangeNote(35, { ref_low: 38, ref_high: 380 }, FERRITIN), '', 'nor does the same range with no unit on file')
  assert.equal(printedRangeNote(35, { ref_low: 30, ref_high: 400 }, FERRITIN), 'lab\'s own range 30–400', 'no unit on file: quoted, not judged')
  assert.equal(printedRangeNote(35, { unit: 'ng/mL', lab: 'Quest' }, FERRITIN), '', 'no printed range')
  assert.equal(printedRangeNote(35, null, FERRITIN), '')
  // A CHW differential: stored in cells/uL, printed in thousands. The figures are not comparable.
  const NEUT = { unit: 'cells/uL', refMin: 1500, refMax: 7800 }
  assert.equal(printedRangeNote(1300, { ref_low: 1.4, ref_high: 7, unit: 'x10E3/uL' }, NEUT), 'lab\'s own range 1.4–7 x10E3/uL')
  // The same unit spelled the lab's way is the same unit.
  assert.equal(printedRangeNote(11.5, { ref_low: 3.4, ref_high: 12, unit: 'x10E3/uL' }, { unit: 'K/uL', refMin: 3.8, refMax: 10.8 }), 'inside the lab\'s own range, 3.4–12 x10E3/uL')
  assert.equal(unitKey('Thousand/uL'), unitKey('K/uL'))
  assert.equal(unitKey('µIU/mL'), unitKey('mIU/L'))
  assert.equal(unitKey('mL/min/1.73m²'), unitKey('mL/min/1.73m2'))
  assert.notEqual(unitKey('cells/uL'), unitKey('K/uL'))
  // A bound is never called inside a range, and a floor-only range reads the right way round.
  assert.equal(printedRangeNote(0.3, { qualifier: '<', ref_low: 0.2, ref_high: 9, unit: 'mIU/mL' }, { unit: 'mIU/mL', refMin: 1.5, refMax: 9.3 }), 'lab\'s own range 0.2–9 mIU/mL')
  assert.equal(readingRangeText({ ref_low: 40, ref_high: undefined }), '>40', 'the catalogue\'s HDL floor, which the report printed as "40>"')
  // A ratio has no unit on either side.
  assert.equal(printedRangeNote(5.4, { ref_high: 6 }, { unit: '', refMax: 5 }), 'inside the lab\'s own range, <6')
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
  assert.equal(cellText(rows[1].cells.testosterone_total), '>1500†', 'printed with its sign (audit #44 item 23)')
  assert.equal(cellText(rows[0].cells.testosterone_total), '980 (−200)', 'Oct diffs against Aug, not the ceiling')
})
