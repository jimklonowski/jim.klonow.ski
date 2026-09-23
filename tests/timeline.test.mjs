// Unit tests for the protocol-timeline gantt engine (shared/utils/timeline.ts), which the
// compounds page and the calendar both render through JournalProtocolTimeline.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTimeline, slotKeyOf, slotLabel, timelineSlots, toRuns } from '../shared/utils/timeline.ts'

const dose = compound => ({ compound })
const entry = (date, ...compounds) => ({ date, peptides: compounds.map(dose) })
const close = (a, b) => Math.abs(a - b) < 1e-9

test('slots cover the whole range, by Sunday week or by month', () => {
  assert.deepEqual(timelineSlots('2026-09-09', '2026-09-23', 'week'), ['2026-09-06', '2026-09-13', '2026-09-20'])
  assert.deepEqual(timelineSlots('2026-11-20', '2027-02-01', 'month'), ['2026-11', '2026-12', '2027-01', '2027-02'])
  assert.deepEqual(timelineSlots('2026-09-24', '2026-09-23', 'week'), [])
  assert.equal(slotKeyOf('2026-09-12', 'week'), '2026-09-06')
  assert.equal(slotKeyOf('2026-09-12', 'month'), '2026-09')
})

test('slot labels match what the pages showed before the extraction', () => {
  // The old code used toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).
  assert.equal(slotLabel('2026-09', 'month'), new Date(2026, 8, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }))
  assert.equal(slotLabel('2026-09-13', 'week'), 'week of Sep 13')
})

test('contiguous active slots merge into one bar', () => {
  const slots = ['a', 'b', 'c', 'd', 'e']
  const runs = toRuns(slots, new Set(['a', 'b', 'd']), 'X', 'week')
  assert.equal(runs.length, 2)
  assert.ok(close(runs[0].left, 0) && close(runs[0].width, 40))
  assert.ok(close(runs[1].left, 60) && close(runs[1].width, 20))
  assert.deepEqual(toRuns([], new Set(['a']), 'X', 'week'), [])
})

test('logged rows come in first-use order with their active-slot count', () => {
  const t = buildTimeline({
    entries: [
      entry('2026-07-02', 'HGH'),
      entry('2026-07-20', 'HGH', 'Testosterone Cypionate'),
      entry('2026-09-10', 'Testosterone Cypionate'),
      entry('2026-09-11', '') // a blank "+ add" row never becomes a timeline row
    ],
    standing: [],
    labDates: [],
    from: '2026-07-02',
    today: '2026-09-23',
    zoom: 'month'
  })
  assert.deepEqual(t.slots, ['2026-07', '2026-08', '2026-09'])
  assert.deepEqual(t.rows.map(r => [r.name, r.count]), [['HGH', 1], ['Testosterone Cypionate', 2]])
  const tc = t.rows[1]
  // July and September, with August empty: two bars, not one.
  assert.equal(tc.runs.length, 2)
  assert.equal(tc.runs[0].title, 'Testosterone Cypionate · Jul 26 → Jul 26')
})

test('standing ranges clamp to the axis, lead the rows, and never double-count a shared slot', () => {
  const t = buildTimeline({
    entries: [entry('2026-08-03', 'HGH')],
    standing: [
      { compound: 'Tadalafil', from: '2025-06-01', to: '2026-08-05', label: '7 mg gummy' },
      { compound: 'Tadalafil', from: '2026-08-06', to: null, label: '5 mg tablet' },
      { compound: 'Old Med', from: '2025-01-01', to: '2025-03-01', label: 'x' } // ended before the axis
    ],
    labDates: [],
    from: '2026-08-03',
    today: '2026-08-20',
    zoom: 'week'
  })
  assert.deepEqual(t.rows.map(r => r.name), ['Tadalafil', 'HGH'])
  assert.equal(t.standingCount, 1)
  const tad = t.rows[0]
  // Three weeks on the axis (Aug 2, 9, 16); the form switch lands both ranges in week one.
  assert.equal(tad.count, 3)
  assert.equal(tad.runs.length, 2)
  assert.ok(close(tad.runs[0].left, 0), 'the 2025 start clamps to the first slot')
  assert.equal(tad.runs[1].title, 'Tadalafil 5 mg tablet · Aug 6, 2026 → now')
})

test('lab draws group per slot, and "now" sits at the end of the current slot', () => {
  const t = buildTimeline({
    entries: [entry('2026-09-01', 'HGH')],
    standing: [],
    labDates: ['2026-09-09', '2026-08-15', '2026-09-03', '2025-01-01'],
    from: '2026-09-01',
    today: '2026-09-23',
    zoom: 'week'
  })
  // Weeks of Aug 30, Sep 6, 13, 20: four slots, 25% each.
  assert.equal(t.slots.length, 4)
  assert.deepEqual(t.labMarks.map(m => [m.slot, m.left]), [['2026-08-30', 12.5], ['2026-09-06', 37.5]])
  assert.equal(t.labMarks[0].title, 'lab draw · Sep 3, 2026')
  assert.equal(t.nowLeft, 100)
})
