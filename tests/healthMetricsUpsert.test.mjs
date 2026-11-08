// The health_metrics upsert (server/utils/db.ts healthMetricsStatement) on the REAL schema in
// node:sqlite — migration 0019: the night is one group, and the two sources that write it are
// ranked (a staged Apple Watch night > Whoop's night > a stageless Apple Health session) so the
// home card's night no longer depends on which delivery arrived last. 2026-11-07: the Watch was
// on the charger, Whoop on; Apple Health delivered the Watch's nap after Whoop's night.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { healthMetricsStatement } from '../server/utils/db.ts'
import { parseHealthExport } from '../shared/utils/healthExport.ts'
import { metricsByDate, sleepMetrics } from '../shared/utils/whoopRecords.ts'

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
const DATE = '2026-11-07'

/** Enough of D1 for the statement — prepare().bind() — with the SQL and binds kept for node:sqlite to run. */
const fakeD1 = {
  prepare(sql) {
    return {
      sql,
      binds: [],
      bind(...b) {
        this.binds = b
        return this
      }
    }
  }
}

function fresh() {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  const write = (fields, date = DATE) => {
    const stmt = healthMetricsStatement(fakeD1, date, fields)
    if (stmt) db.prepare(stmt.sql).run(...stmt.binds)
  }
  const night = (date = DATE) => {
    const row = db.prepare('SELECT sleep_total_min, sleep_rem_min, sleep_deep_min, sleep_core_min, sleep_awake_min, sleep_start, sleep_end, sleep_source FROM health_metrics WHERE date = ?1').get(date)
    return row ? { ...row } : null
  }
  return { db, write, night }
}

// The three shapes of a night, as the two parsers hand them to the upsert.
const sleepPoint = (date, extra) => ({ name: 'sleep_analysis', units: 'hr', data: [{ date: `${date} 08:00:00 -0600`, qty: null, ...extra }] })
const watchNap = parseHealthExport([sleepPoint(DATE, { rem: 0, deep: 0, core: 0, awake: 0.2, asleep: 1.33, sleepStart: '2026-11-07 10:07:36 -0600', sleepEnd: '2026-11-07 11:39:22 -0600' })]).healthByDate[DATE]
const watchNight = parseHealthExport([sleepPoint(DATE, { rem: 1.5, deep: 1, core: 4.5, awake: 0.25, sleepStart: '2026-11-06 23:12:00 -0600', sleepEnd: '2026-11-07 06:27:00 -0600' })]).healthByDate[DATE]
const whoopNight = metricsByDate([{
  start: '2026-11-07T02:10:00.000Z', end: '2026-11-07T10:10:00.000Z', nap: false, score_state: 'SCORED',
  score: { sleep_performance_percentage: 78, stage_summary: { total_awake_time_milli: 3540000, total_light_sleep_time_milli: 11580000, total_slow_wave_sleep_time_milli: 4740000, total_rem_sleep_time_milli: 8880000 } }
}], s => s.end, sleepMetrics)[DATE]

const WHOOP_ROW = { sleep_total_min: 420, sleep_rem_min: 148, sleep_deep_min: 79, sleep_core_min: 193, sleep_awake_min: 59, sleep_start: '2026-11-07T02:10:00.000Z', sleep_end: '2026-11-07T10:10:00.000Z', sleep_source: 'whoop' }
const WATCH_ROW = { sleep_total_min: 420, sleep_rem_min: 90, sleep_deep_min: 60, sleep_core_min: 270, sleep_awake_min: 15, sleep_start: '2026-11-06 23:12:00 -0600', sleep_end: '2026-11-07 06:27:00 -0600', sleep_source: 'health' }
const NAP_ROW = { sleep_total_min: 80, sleep_rem_min: null, sleep_deep_min: null, sleep_core_min: null, sleep_awake_min: 12, sleep_start: '2026-11-07 10:07:36 -0600', sleep_end: '2026-11-07 11:39:22 -0600', sleep_source: 'health' }

test('Whoop\'s night beats a stageless Apple Health session, whichever arrives last', () => {
  const a = fresh()
  a.write(whoopNight)
  a.write(watchNap)
  assert.deepEqual(a.night(), WHOOP_ROW, 'the nap delivered after the night (2026-11-07)')

  const b = fresh()
  b.write(watchNap)
  assert.deepEqual(b.night(), NAP_ROW, 'alone, the nap is the day\'s sleep')
  b.write(whoopNight)
  assert.deepEqual(b.night(), WHOOP_ROW, 'the night delivered after the nap')
})

test('a staged Apple Watch night beats Whoop\'s, whichever arrives last', () => {
  const a = fresh()
  a.write(watchNight)
  a.write(whoopNight)
  assert.deepEqual(a.night(), WATCH_ROW)

  const b = fresh()
  b.write(whoopNight)
  b.write(watchNight)
  assert.deepEqual(b.night(), WATCH_ROW)
})

test('a row from before the column is Apple Health\'s: Whoop never overwrites a staged one, a re-export does', () => {
  const { db, write, night } = fresh()
  db.prepare('INSERT INTO health_metrics (date, sleep_total_min, sleep_rem_min, sleep_deep_min, sleep_core_min, sleep_awake_min) VALUES (?1, 388, 67, 35, 286, 30)').run(DATE)
  write(whoopNight)
  assert.deepEqual(night(), { sleep_total_min: 388, sleep_rem_min: 67, sleep_deep_min: 35, sleep_core_min: 286, sleep_awake_min: 30, sleep_start: null, sleep_end: null, sleep_source: null })
  write(watchNight)
  assert.deepEqual(night(), WATCH_ROW)
})

test('the same source re-sent replaces its own night whole — fields it no longer carries go null', () => {
  const { write, night } = fresh()
  write(whoopNight)
  const rescored = { ...whoopNight, sleep_total_min: 430 }
  delete rescored.sleep_awake_min
  delete rescored.sleep_start
  write(rescored)
  assert.deepEqual(night(), { ...WHOOP_ROW, sleep_total_min: 430, sleep_awake_min: null, sleep_start: null })
})

test('the other fields in a losing delivery still land, and a delivery with no night leaves the night alone', () => {
  const { db, write, night } = fresh()
  write(watchNight)
  write({ ...whoopNight, recovery_score: 67, sleep_performance_pct: 78 })
  assert.deepEqual(night(), WATCH_ROW)
  const row = db.prepare('SELECT recovery_score, sleep_performance_pct FROM health_metrics WHERE date = ?1').get(DATE)
  assert.deepEqual({ ...row }, { recovery_score: 67, sleep_performance_pct: 78 })
  write({ steps: 9000 })
  assert.deepEqual(night(), WATCH_ROW)
  assert.equal(db.prepare('SELECT steps FROM health_metrics WHERE date = ?1').get(DATE).steps, 9000)
})
