// The pet's shared sleep/recovery read (shared/utils/petState.ts), audit #42 item 19.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SLEEP_RESTED_MIN, SLEEP_SHORT_MIN, isSluggish, latestRecovery, latestSleepMin } from '../shared/utils/petState.ts'

const row = (date, sleep_total_min, recovery_score = null) => ({ date, sleep_total_min, recovery_score })

test('sluggish: a short night enters it, a middling night keeps it, only a rested night clears it', () => {
  assert.equal(SLEEP_SHORT_MIN, 360)
  assert.equal(SLEEP_RESTED_MIN, 420)
  assert.equal(isSluggish([row('2026-10-18', 300)]), true, 'under six hours')
  assert.equal(isSluggish([row('2026-10-18', 300), row('2026-10-19', 400)]), true, '6h40m does not clear it')
  assert.equal(isSluggish([row('2026-10-18', 300), row('2026-10-19', 400), row('2026-10-20', 420)]), false, 'seven hours clears it')
  assert.equal(isSluggish([row('2026-10-18', 400)]), false, 'a middling night alone never enters it')
  assert.equal(isSluggish([row('2026-10-18', 480), row('2026-10-19', 359)]), true, 'the newest short night wins')
  assert.equal(isSluggish([]), false)
})

test('nights without a total are skipped, and the walk is by date whatever order the rows arrive in', () => {
  assert.equal(isSluggish([row('2026-10-18', 300), row('2026-10-19', null), row('2026-10-20', null)]), true)
  // Arrives newest-first: the rested night is still the latest and clears it.
  assert.equal(isSluggish([row('2026-10-20', 450), row('2026-10-19', 300)]), false)
  assert.equal(isSluggish([row('2026-10-19', 450), row('2026-10-20', 300)]), true)
})

test('recovery and sleep read the newest NON-NULL value, not the last row', () => {
  const rows = [row('2026-10-18', 420, 61), row('2026-10-19', 380, 48), row('2026-10-20', null, null)]
  assert.equal(latestRecovery(rows), 48, 'an unscored today falls back to yesterday')
  assert.equal(latestSleepMin(rows), 380)
  assert.equal(latestRecovery([row('2026-10-20', 400, null)]), null)
  assert.equal(latestRecovery([]), null)
  // Order-independent.
  assert.equal(latestRecovery([row('2026-10-20', null, null), row('2026-10-19', 380, 48), row('2026-10-18', 420, 61)]), 48)
})
