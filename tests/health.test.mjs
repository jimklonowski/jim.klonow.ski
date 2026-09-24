// The /api/health rules (shared/utils/health.ts): when a task or a data feed counts as healthy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { feedCheck, isHealthy, taskCheck } from '../shared/utils/health.ts'

const NOW = Date.parse('2026-09-24T15:00:00Z')
const ago = h => new Date(NOW - h * 3_600_000).toISOString()
const history = (over = {}) => ({ lastOkAt: null, lastRunAt: null, lastRunOk: null, lastError: null, ...over })

test('a daily task that ran cleanly within its window is ok', () => {
  const c = taskCheck('digest:daily', 26, history({ lastOkAt: ago(1), lastRunAt: ago(1), lastRunOk: true }), ago(500), NOW)
  assert.equal(c.status, 'ok')
  assert.equal(c.detail, 'last ran 1h ago')
})

test('a latest run that threw is failing, even while the last clean run is still recent', () => {
  const c = taskCheck('whoop:sync', 26, history({ lastOkAt: ago(25), lastRunAt: ago(1), lastRunOk: false, lastError: 'recovery: 503' }), ago(500), NOW)
  assert.equal(c.status, 'failing')
  assert.match(c.detail, /failed: recovery: 503/)
})

test('a clean run older than the window is stale', () => {
  assert.equal(taskCheck('digest:daily', 26, history({ lastOkAt: ago(30), lastRunAt: ago(30), lastRunOk: true }), ago(500), NOW).status, 'stale')
  // The weekly window absorbs six quiet days.
  assert.equal(taskCheck('db:backup', 170, history({ lastOkAt: ago(160), lastRunAt: ago(160), lastRunOk: true }), ago(500), NOW).status, 'ok')
})

test('never having run is pending while the log is young, and stale once the window has passed', () => {
  // Just deployed: the weekly backup has had no chance to run yet.
  assert.equal(taskCheck('db:backup', 170, history(), ago(20), NOW).status, 'pending')
  assert.equal(taskCheck('db:backup', 170, history(), null, NOW).status, 'pending')
  // A week and a bit of other tasks logging, and still nothing: the cron isn't firing.
  assert.equal(taskCheck('db:backup', 170, history(), ago(200), NOW).status, 'stale')
})

test('feeds are judged in days behind today', () => {
  const today = '2026-09-24'
  assert.equal(feedCheck({ name: 'apple:sleep', latest: '2026-09-24', staleAfterDays: 2 }, today).status, 'ok')
  assert.equal(feedCheck({ name: 'apple:sleep', latest: '2026-09-22', staleAfterDays: 2 }, today).status, 'ok')
  assert.equal(feedCheck({ name: 'apple:sleep', latest: '2026-09-21', staleAfterDays: 2 }, today).status, 'stale')
  assert.equal(feedCheck({ name: 'whoop:recovery', latest: null, staleAfterDays: 2 }, today).status, 'stale')
})

test('pending keeps the site healthy; stale and failing do not', () => {
  assert.equal(isHealthy([{ status: 'ok' }, { status: 'pending' }]), true)
  assert.equal(isHealthy([{ status: 'ok' }, { status: 'stale' }]), false)
  assert.equal(isHealthy([{ status: 'failing' }]), false)
})
