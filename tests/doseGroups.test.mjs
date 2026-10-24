// Unit tests for shared/utils/doseGroups.ts — the home page's folded dose rows.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupDoses } from '../shared/utils/doseGroups.ts'

const iron = time => ({ time, compound: 'Iron Bisglycinate', dose: 75, unit: 'mg', site: 'oral' })

test('identical doses fold into one group with every time, in log order', () => {
  const groups = groupDoses([
    { time: '04:24', compound: 'Finasteride', dose: 1, unit: 'mg', site: 'oral' },
    iron('10:20'), iron('16:30'), iron('20:29')
  ])
  assert.equal(groups.length, 2)
  const [fin, fe] = groups
  assert.equal(fin.count, 1)
  assert.deepEqual(fin.times, ['04:24'])
  assert.equal(fe.count, 3)
  assert.equal(fe.first.time, '10:20')
  assert.deepEqual(fe.times, ['10:20', '16:30', '20:29'])
  assert.equal(fe.total, 225)
})

test('a different site, amount or unit is its own row; order follows the first dose of each group', () => {
  const groups = groupDoses([
    { time: '04:25', compound: 'HGH', dose: 2.5, unit: 'iu', site: 'right_glute' },
    { time: '10:20', compound: 'Iron Bisglycinate', dose: 75, unit: 'mg', site: 'oral' },
    { time: '16:25', compound: 'HGH', dose: 2.5, unit: 'iu', site: 'left_glute' },
    { time: '16:30', compound: 'Iron Bisglycinate', dose: 50, unit: 'mg', site: 'oral' },
    { time: '20:29', compound: 'Iron Bisglycinate', dose: 75, unit: 'mg', site: 'oral' }
  ])
  assert.deepEqual(groups.map(g => `${g.first.compound}@${g.first.time}×${g.count}`), [
    'HGH@04:25×1', 'Iron Bisglycinate@10:20×2', 'HGH@16:25×1', 'Iron Bisglycinate@16:30×1'
  ])
})

test('fractional doses total without float noise; missing times and sites are tolerated', () => {
  const groups = groupDoses([
    { time: '', compound: 'Tirzepatide', dose: 0.1, unit: 'mg' },
    { time: null, compound: 'Tirzepatide', dose: 0.1, unit: 'mg' },
    { time: '09:00', compound: 'Tirzepatide', dose: 0.1, unit: 'mg' }
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].total, 0.3)
  assert.deepEqual(groups[0].times, ['09:00'])
})

test('an empty log is an empty list', () => {
  assert.deepEqual(groupDoses([]), [])
})
