import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mean } from '../shared/utils/stats.ts'

test('mean skips nulls, undefined and NaN, and is null with nothing to average', () => {
  assert.equal(mean([1, 2, 3]), 2)
  assert.equal(mean([1, null, undefined, Number.NaN, 3]), 2)
  assert.equal(mean([]), null)
  assert.equal(mean([null, undefined]), null)
  assert.equal(mean(new Set([10, 20])), 15, 'any iterable')
})
