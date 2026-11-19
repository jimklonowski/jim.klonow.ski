// The owner's lab context as the client receives it (audit #43 item 48): the server data files
// keep the prose, the client gets bands, caveats and each draw's notes, and the pure helpers
// (shared/utils/labNotes.ts) read those shapes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boundKind, boundPhrase, boundValueText, caveatCompoundOn, isCensored, readingNoteOn } from '../shared/utils/labNotes.ts'
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
