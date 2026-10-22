import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RECOVERY_GREEN_MIN, RECOVERY_PEAK_MIN, RECOVERY_RED_MAX, isPeakRecovery, recoveryZone } from '../shared/utils/recovery.ts'

test('Whoop zones: green at 67 and up, red under 34, yellow between', () => {
  assert.equal(RECOVERY_GREEN_MIN, 67)
  assert.equal(RECOVERY_RED_MAX, 34)
  assert.equal(recoveryZone(67), 'green')
  assert.equal(recoveryZone(66), 'yellow')
  assert.equal(recoveryZone(34), 'yellow')
  assert.equal(recoveryZone(33), 'red')
  assert.equal(recoveryZone(100), 'green')
  assert.equal(recoveryZone(0), 'red')
})

test('the peak line is 80 inclusive', () => {
  assert.equal(RECOVERY_PEAK_MIN, 80)
  assert.equal(isPeakRecovery(80), true)
  assert.equal(isPeakRecovery(79), false)
  assert.equal(isPeakRecovery(null), false)
})
