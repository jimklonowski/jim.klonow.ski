// The /api/health rules (shared/utils/health.ts): when a task or a data feed counts as healthy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { FEED_LATEST_SQL, FEED_STALE_AFTER_DAYS, feedCheck, isHealthy, taskCheck } from '../shared/utils/health.ts'

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

// Audit #44 item 37: the Apple sleep feed is Apple's nights only, on the REAL schema.
test('a Whoop night does not keep the Apple sleep feed green', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8'))
  const night = (date, source, total = 420) => db.prepare('INSERT INTO health_metrics (date, sleep_total_min, sleep_source) VALUES (?, ?, ?)').run(date, total, source)
  const latest = () => ({ ...db.prepare(FEED_LATEST_SQL).get() })
  assert.deepEqual(latest(), { sleep: null, weight: null, recovery: null })
  night('2026-11-01', null) // a row from before the column: Apple Health's
  night('2026-11-05', 'health')
  night('2026-11-08', 'whoop')
  night('2026-11-09', 'whoop')
  db.prepare('INSERT INTO health_metrics (date, recovery_score) VALUES (?, ?)').run('2026-11-10', 61)
  db.prepare('INSERT INTO journal_entries (date, weight_lbs) VALUES (?, ?)').run('2026-11-09', 170)
  assert.deepEqual(latest(), { sleep: '2026-11-05', weight: '2026-11-09', recovery: '2026-11-10' })
  const check = feedCheck({ name: 'apple:sleep', latest: latest().sleep, staleAfterDays: FEED_STALE_AFTER_DAYS['apple:sleep'] }, '2026-11-10')
  assert.equal(check.status, 'stale', 'five days without an Apple night, whatever Whoop sent')
})
