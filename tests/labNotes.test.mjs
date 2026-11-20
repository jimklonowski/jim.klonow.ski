// The owner's lab context as the client receives it (audit #43 item 48): the server data files
// keep the prose, the client gets bands, caveats and each draw's notes, and the pure helpers
// (shared/utils/labNotes.ts) read those shapes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LAB_FACT_LEGEND, boundKind, boundPhrase, boundValueText, caveatCompoundOn, isCensored, labFactLines, readingNoteOn } from '../shared/utils/labNotes.ts'
import { eventBands } from '../shared/utils/protocolEvents.ts'
import { PROTOCOL_EVENTS } from '../server/data/protocolEvents.ts'
import { MARKER_CAVEATS, READING_NOTES, isCensoredOn, readingNoteFor, readingNotesOn } from '../server/data/markerCaveats.ts'

test('a band is from, to and label — never the note', () => {
  const bands = eventBands(PROTOCOL_EVENTS)
  assert.deepEqual(bands, [{ from: '2026-09-05', to: '2026-09-07', label: 'Labor Day travel' }])
  for (const b of bands) assert.deepEqual(Object.keys(b).sort(), ['from', 'label', 'to'])
  assert.doesNotMatch(JSON.stringify(bands), /HGH|hCG|testosterone/, 'nothing of the prose leaks into the bands')
  assert.deepEqual(eventBands([{ from: '2026-01-01', label: 'one day', note: 'x' }]), [{ from: '2026-01-01', label: 'one day' }], 'a single-day event has no `to`')
})

test('a draw carries its own notes, keyed by marker; a clean draw carries nothing', () => {
  const sep9 = readingNotesOn('2026-09-09')
  assert.deepEqual(Object.keys(sep9), ['testosterone_total'])
  assert.equal(sep9.testosterone_total.censored, true)
  assert.equal(readingNotesOn('2026-10-17').estradiol.date, '2026-10-17')
  assert.equal(readingNotesOn('2026-10-18'), undefined, 'undefined, so the list row is sent as it was')
  assert.equal(readingNoteFor('estradiol', '2026-08-15').note, READING_NOTES.estradiol[0].note)
  assert.equal(readingNoteFor('estradiol', '2026-09-09'), null)
  assert.equal(isCensoredOn('testosterone_total', '2026-09-09'), true)
  assert.equal(isCensoredOn('estradiol', '2026-10-17'), false, 'a provenance note is not a bound')
})

test('the client helpers read the notes off the draw — a draw without them, or no draw, is clean', () => {
  const draw = { date: '2026-09-09', markers: { testosterone_total: 1500 }, notes: readingNotesOn('2026-09-09') }
  assert.equal(isCensored(draw, 'testosterone_total'), true)
  assert.equal(readingNoteOn(draw, 'testosterone_total').censored, true)
  assert.equal(isCensored(draw, 'estradiol'), false)
  assert.equal(isCensored({ date: '2026-09-09', markers: {} }, 'testosterone_total'), false, 'a demo draw on the same date carries no notes')
  assert.equal(isCensored(undefined, 'testosterone_total'), false)
  assert.equal(readingNoteOn(null, 'estradiol'), null)
})

test('a bound is a floor, a ceiling or a limit, and is printed with the sign the report gave it (audit #44 item 23)', () => {
  // LH on a suppressing protocol: the report prints "<0.3", a floor.
  const floor = { date: '2026-10-17', markers: { lh: 0.3 }, readings: { lh: { qualifier: '<', lab: 'Quest' } } }
  assert.equal(boundKind(floor, 'lh'), 'floor')
  assert.equal(boundValueText('0.3', floor, 'lh'), '<0.3')
  assert.equal(boundPhrase('floor'), 'below the assay\'s floor')
  // The Sep 9 immunoassay testosterone: ">1500", a ceiling, by the printed qualifier.
  const ceiling = { date: '2026-09-09', markers: { testosterone_total: 1500 }, readings: { testosterone_total: { qualifier: '>' } }, notes: readingNotesOn('2026-09-09') }
  assert.equal(boundKind(ceiling, 'testosterone_total'), 'ceiling')
  assert.equal(boundValueText(1500, ceiling, 'testosterone_total'), '>1500')
  assert.equal(boundPhrase('ceiling'), 'at the assay\'s ceiling')
  // The same reading before provenance existed: the hand note says censored, the direction is not on file.
  const noted = { date: '2026-09-09', markers: { testosterone_total: 1500 }, notes: readingNotesOn('2026-09-09') }
  assert.equal(boundKind(noted, 'testosterone_total'), 'limit')
  assert.equal(boundValueText(1500, noted, 'testosterone_total'), '1500', 'no sign is invented')
  assert.equal(boundPhrase('limit'), 'at the assay\'s limit')
  // A measurement, a provenance-only note, another marker on the draw, no draw.
  assert.equal(boundKind({ date: 'd', markers: { lh: 2.1 }, readings: { lh: { lab: 'Quest' } } }, 'lh'), null)
  assert.equal(boundKind({ date: '2026-10-17', markers: { estradiol: 157 }, notes: readingNotesOn('2026-10-17') }, 'estradiol'), null)
  assert.equal(boundKind(floor, 'fsh'), null)
  assert.equal(boundKind(null, 'lh'), null)
  assert.equal(boundValueText('2.1', null, 'lh'), '2.1')
  for (const d of [floor, ceiling, noted]) assert.equal(isCensored(d, Object.keys(d.markers)[0]), true, 'every bound is censored')
})

// Audit #44 item 32: the /ask fact sheet printed `testosterone_total 1500` for a ceiling. The
// fixtures are made up; the last check runs the real hand notes through the same function.
test('the fact sheet prints a reading as the report did, daggers the marked ones and lists their notes', () => {
  const { lines, notes } = labFactLines([
    { date: '2031-01-05', fasting: true, markers: { testosterone_total: 900, lh: 0.3, hdl: null }, readings: { testosterone_total: { lab: 'Quest' }, lh: { qualifier: '<', lab: 'Quest', assay: 'immunoassay' } } },
    { date: '2031-02-06', fasting: false, markers: { testosterone_total: 1500, hematocrit: 50.1 }, readings: { testosterone_total: { qualifier: '>', lab: 'CHW' } }, notes: { testosterone_total: { date: '2031-02-06', note: 'Reported at the ceiling.', censored: true } } },
    { date: '2031-03-07', markers: { estradiol: 30, ferritin: 60 }, notes: { estradiol: { date: '2031-03-07', note: 'A different assay.' }, ferritin: { date: '2031-03-07', note: 'Censored by hand, direction unknown.', censored: true } } },
    { date: '2031-04-08', markers: {} }
  ])
  assert.deepEqual(lines, [
    '2031-01-05 (fasting, Quest): testosterone_total 900, lh <0.3†',
    '2031-02-06 (CHW): testosterone_total >1500†, hematocrit 50.1',
    '2031-03-07: estradiol 30†, ferritin 60†',
    '2031-04-08: '
  ])
  assert.deepEqual(notes, [
    '† lh on 2031-01-05 (below the assay\'s floor: a bound, not a measurement): the report printed it as <0.3, Quest immunoassay.',
    '† testosterone_total on 2031-02-06 (at the assay\'s ceiling: a bound, not a measurement): Reported at the ceiling.',
    '† estradiol on 2031-03-07: A different assay.',
    '† ferritin on 2031-03-07 (at the assay\'s limit: a bound, not a measurement): Censored by hand, direction unknown.'
  ])
  assert.match(LAB_FACT_LEGEND, /not a measurement/)
  assert.deepEqual(labFactLines([]), { lines: [], notes: [] })
  // Every hand note on file reaches the sheet, each censored one called a bound.
  for (const [key, list] of Object.entries(READING_NOTES)) {
    for (const n of list) {
      const out = labFactLines([{ date: n.date, markers: { [key]: 1 }, notes: readingNotesOn(n.date) }])
      assert.ok(out.lines[0].includes(`${key} 1†`), `${key} ${n.date} is daggered`)
      const line = out.notes.find(l => l.startsWith(`† ${key} on ${n.date}`))
      assert.ok(line, `${key} ${n.date} has its note`)
      assert.equal(/a bound, not a measurement/.test(line), n.censored === true, `${key} ${n.date}: called a bound exactly when censored`)
    }
  }
})

test('the medication caveat follows the protocol dates, over the caveats the server sent', () => {
  const spans = [
    { compound: 'Finasteride', from: '2026-07-29', to: '2026-10-05' },
    { compound: 'Isotretinoin', from: '2026-11-06', to: null }
  ]
  assert.equal(caveatCompoundOn(MARKER_CAVEATS, 'psa', '2026-09-09', spans), 'Finasteride')
  assert.equal(caveatCompoundOn(MARKER_CAVEATS, 'psa', '2026-07-01', spans), null, 'pre-treatment readings stay clean')
  assert.equal(caveatCompoundOn(MARKER_CAVEATS, 'ldl', '2026-12-01', spans), 'Isotretinoin')
  assert.equal(caveatCompoundOn(MARKER_CAVEATS, 'hematocrit', '2026-12-01', spans), null, 'no caveat for the marker')
  assert.equal(caveatCompoundOn({}, 'psa', '2026-09-09', spans), null, 'the demo sandbox is sent no caveats')
})
