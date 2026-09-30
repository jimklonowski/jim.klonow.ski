// Protocol notes on the trend charts (shared/utils/chartAnnotations.ts): what gets collected
// from the real rules/events, and how it snaps onto a chart's sparse category axis.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { annotationsAt, cycleAnnotations, eventAnnotations, placeAnnotations, ruleAnnotations } from '../shared/utils/chartAnnotations.ts'
import { PROTOCOL_EVENTS } from '../shared/utils/protocolEvents.ts'
import { PROTOCOL_RULES } from '../shared/utils/protocolRules.ts'

test('dose steps become short "from→to" lines, plus a start per rule and a stop for ended ones', () => {
  const texts = ruleAnnotations(PROTOCOL_RULES).map(a => `${a.from} ${a.text}`)
  assert.ok(texts.includes('2026-08-24 T 100→75 mg'), 'the T cut')
  assert.ok(texts.includes('2026-06-18 T start 50 mg'), 'T start uses the first step')
  assert.ok(texts.includes('2026-09-03 HGH 2→2.5 IU'))
  assert.ok(texts.includes('2026-07-21 hCG 500→250 IU'))
  assert.ok(texts.includes('2026-07-29 Finasteride start 1 mg'), 'a rule without steps starts at its doseLabel')
  assert.ok(texts.includes('2026-09-02 GHK stop'), 'the day after `to`')
})

test('only labelled events become bands; the rest stay prompt-only', () => {
  const bands = eventAnnotations(PROTOCOL_EVENTS)
  assert.deepEqual(bands, [{ kind: 'event', from: '2026-09-05', to: '2026-09-07', text: 'Labor Day travel' }])
})

test('a line lands on the first point on or after its date, and only inside the data', () => {
  const dates = ['2026-08-20', '2026-08-23', '2026-08-26', '2026-08-30']
  const placed = placeAnnotations([
    { kind: 'dose', from: '2026-08-24', text: 'T 100→75 mg' },
    { kind: 'dose', from: '2026-08-23', text: 'on a point' },
    { kind: 'dose', from: '2026-08-01', text: 'before the window' },
    { kind: 'dose', from: '2026-09-02', text: 'after the window' }
  ], dates)
  assert.deepEqual(placed.map(p => [p.text, p.at]), [['on a point', '2026-08-23'], ['T 100→75 mg', '2026-08-26']])
})

test('a band covers its first and last points inside the span, clipped to the data', () => {
  const dates = ['2026-09-04', '2026-09-06', '2026-09-08', '2026-09-20', '2026-09-26']
  const placed = placeAnnotations([
    ...eventAnnotations(PROTOCOL_EVENTS),
    ...cycleAnnotations([{ name: 'Vorck', from: '2026-09-18', to: '2026-09-27' }]),
    { kind: 'event', from: '2026-09-10', to: '2026-09-12', text: 'no point inside' }
  ], dates)
  assert.deepEqual(placed.map(p => [p.text, p.at, p.end]), [
    ['Labor Day travel', '2026-09-06', '2026-09-06'],
    ['Vorck', '2026-09-20', '2026-09-26']
  ])
})

test('placement stays year-exact on a multi-year axis: same month-day, different years', () => {
  // The old label-based placement collapsed 2024-08-24 and 2026-08-24 onto one "Aug 24" category.
  const dates = ['2024-08-24', '2025-08-24', '2026-08-20', '2026-08-24', '2026-08-30']
  const placed = placeAnnotations([{ kind: 'dose', from: '2026-08-24', text: 'T 100→75 mg' }], dates)
  assert.deepEqual(placed.map(p => p.at), ['2026-08-24'])
  // And the hover lookup on the 2024 point finds nothing.
  assert.deepEqual(annotationsAt(placed, '2024-08-24', dates), [])
  assert.deepEqual(annotationsAt(placed, '2026-08-24', dates).map(p => p.text), ['T 100→75 mg'])
})

test('the hover lookup finds lines on the category and bands spanning it', () => {
  const order = ['a', 'b', 'c', 'd']
  const placed = [
    { kind: 'dose', text: 'line b', at: 'b', from: 'x' },
    { kind: 'cycle', text: 'band b–d', at: 'b', end: 'd', from: 'x', to: 'y' }
  ]
  assert.deepEqual(annotationsAt(placed, 'a', order).map(p => p.text), [])
  assert.deepEqual(annotationsAt(placed, 'b', order).map(p => p.text), ['line b', 'band b–d'])
  assert.deepEqual(annotationsAt(placed, 'c', order).map(p => p.text), ['band b–d'])
  assert.deepEqual(annotationsAt(placed, 'zz', order), [])
})
