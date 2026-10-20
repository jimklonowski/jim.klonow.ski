// Unit tests for the water helpers (shared/utils/water.ts).
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  WATER_DEFAULT_CUP_OZ, WATER_DEFAULT_GOAL_OZ, fmtWaterOz, waterProgress, waterSetting, waterTotals
} from '../shared/utils/water.ts'

test('totals sum the ounces and count the pours, skipping anything that is not a number', () => {
  assert.deepEqual(waterTotals([{ time: '08:00', oz: 12 }, { time: '10:30', oz: 12 }, { time: '13:00', oz: 8.5 }]), { count: 3, oz: 32.5 })
  assert.deepEqual(waterTotals([{ time: '08:00', oz: 12 }, { time: '09:00' }, { time: '10:00', oz: null }, { oz: Number.NaN }]), { count: 1, oz: 12 })
  assert.deepEqual(waterTotals([]), { count: 0, oz: 0 })
  assert.deepEqual(waterTotals(null), { count: 0, oz: 0 })
  assert.deepEqual(waterTotals(undefined), { count: 0, oz: 0 })
})

test('floating-point pours round to one decimal', () => {
  assert.equal(waterTotals([{ oz: 0.1 }, { oz: 0.2 }]).oz, 0.3)
  assert.equal(waterTotals([{ oz: 8.33 }, { oz: 8.33 }, { oz: 8.33 }]).oz, 25)
})

test('formatting: whole ounces stay whole, fractions keep one decimal, nothing reads as empty', () => {
  assert.equal(fmtWaterOz(84), '84 oz')
  assert.equal(fmtWaterOz(32.5), '32.5 oz')
  assert.equal(fmtWaterOz(0), '')
})

test('profile settings parse back to numbers and fall back when unset or mistyped', () => {
  assert.equal(waterSetting({ water_goal_oz: '120' }, 'water_goal_oz', WATER_DEFAULT_GOAL_OZ), 120)
  assert.equal(waterSetting({ cup_oz: '8.5' }, 'cup_oz', WATER_DEFAULT_CUP_OZ), 8.5)
  assert.equal(waterSetting({}, 'water_goal_oz', WATER_DEFAULT_GOAL_OZ), WATER_DEFAULT_GOAL_OZ)
  assert.equal(waterSetting(null, 'cup_oz', WATER_DEFAULT_CUP_OZ), WATER_DEFAULT_CUP_OZ)
  assert.equal(waterSetting({ cup_oz: '' }, 'cup_oz', 12), 12)
  assert.equal(waterSetting({ cup_oz: 'twelve' }, 'cup_oz', 12), 12)
  assert.equal(waterSetting({ cup_oz: '0' }, 'cup_oz', 12), 12, 'a zero cup would make the quick-add log nothing')
  assert.equal(waterSetting({ cup_oz: '-4' }, 'cup_oz', 12), 12)
})

test('goal progress is a 0–1 share that caps at the goal', () => {
  assert.equal(waterProgress(50, 100), 0.5)
  assert.equal(waterProgress(0, 100), 0)
  assert.equal(waterProgress(140, 100), 1)
  assert.equal(waterProgress(50, 0), 0, 'a zero goal is not a division by zero')
})
