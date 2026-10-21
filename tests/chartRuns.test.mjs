// Unit tests for the line-run splitter behind AreaChart (app/utils/chartRuns.ts), audit #42 item 3.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitRuns } from '../app/utils/chartRuns.ts'

const rows = [
  { date: '10-01', w: 170 },
  { date: '10-02', w: 171 },
  { date: '10-03', w: null }, // not weighed
  { date: '10-04', w: undefined },
  { date: '10-05', w: 169 },
  { date: '10-06', w: Number.NaN },
  { date: '10-07', w: 168 }
]
const pick = r => r.w
const map = (r, v) => `${r.date}=${v}`

test('a missing reading breaks the line; consecutive readings stay in one run', () => {
  assert.deepEqual(splitRuns(rows, pick, map), [
    ['10-01=170', '10-02=171'],
    ['10-05=169'],
    ['10-07=168']
  ])
})

test('connect draws one unbroken line through every reading', () => {
  assert.deepEqual(splitRuns(rows, pick, map, true), [['10-01=170', '10-02=171', '10-05=169', '10-07=168']])
})

test('edges: leading and trailing gaps, no readings at all, no rows', () => {
  assert.deepEqual(splitRuns([{ w: null }, { w: 1 }, { w: 2 }, { w: null }], pick, (_, v) => v), [[1, 2]])
  assert.deepEqual(splitRuns([{ w: null }, { w: null }], pick, (_, v) => v), [])
  assert.deepEqual(splitRuns([], pick, (_, v) => v), [])
})

test('a run of one is a reading with nothing measured either side (the chart draws it as a dot)', () => {
  assert.deepEqual(splitRuns([{ w: null }, { w: 5 }, { w: null }], pick, (_, v) => v), [[5]])
})
