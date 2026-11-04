// Trend weight and lbs/week (shared/utils/weightTrend.ts) — audit #43 item 55.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeTrend, fmtRate, weighInsOf, weightTrend } from '../shared/utils/weightTrend.ts'

const day = i => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10) // 2026-09-01 + i
const TODAY = day(39) // 2026-10-10
const series = (n, f) => Array.from({ length: n }, (_, i) => ({ date: day(i), value: f(i) }))
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (±${tol})`)

test('a flat weight with daily ±1 lb noise reads flat: the trend sits on the mean, the rate is ~0', () => {
  const t = weightTrend(series(40, i => 180 + (i % 2 ? 1 : -1)), TODAY)
  near(t.trend, 180, 0.4, 'trend')
  near(t.ratePerWeek, 0, 0.3, 'rate')
  assert.equal(t.confidence, 'settled')
  assert.equal(t.ratePoints, 14)
  assert.equal(t.latest.date, TODAY)
})

test('a steady climb reads as its true rate once the trend has settled, lagging the raw by slope×τ', () => {
  const t = weightTrend(series(40, i => 170 + 0.5 * i), TODAY) // +3.5 lb/wk
  near(t.ratePerWeek, 3.5, 0.2, 'rate')
  near(t.latest.value - t.trend, 5, 0.6, 'lag ≈ 0.5 lb/day × 10 days')
  assert.equal(t.confidence, 'settled')
  // A realistic cut, −0.5 lb/wk, lags under a pound.
  const cut = weightTrend(series(60, i => 185 - (0.5 / 7) * i), day(59))
  near(cut.ratePerWeek, -0.5, 0.1, 'cut rate')
  near(cut.latest.value - cut.trend, -0.7, 0.3, 'cut lag')
})

test('one spike barely moves the trend; a wild outlier counts half', () => {
  const flat = series(30, () => 180)
  const spike = weightTrend([...flat, { date: day(30), value: 182 }], day(30))
  near(spike.trend, 180.2, 0.1, 'a 2 lb spike moves it ~0.2')
  const wild = weightTrend([...flat, { date: day(30), value: 188 }], day(30))
  near(wild.trend, 180.4, 0.1, 'an 8 lb outlier moves it ~0.4, not ~0.8')
  // Agreed by the next readings, the trend follows anyway.
  const stepped = weightTrend([...flat, ...series(14, () => 188).map((p, i) => ({ ...p, date: day(30 + i) }))], day(43))
  assert.ok(stepped.trend > 185, `a real step is followed within two weeks: ${stepped.trend}`)
})

test('a gap: the first reading after a hole pulls the trend most of the way; the rate waits for the window to refill', () => {
  const before = series(20, () => 180) // through 2026-09-20
  const after = { date: day(32), value: 177 } // 12 days later, 3 lb down
  const t = weightTrend([...before, after], day(32))
  near(t.trend, 177.9, 0.2, '1 − e^(−1.2) ≈ 0.70 of the 3 lb')
  assert.equal(t.ratePerWeek, null, 'two readings in the window (the last old one sits on its edge) are no rate')
  assert.equal(t.confidence, null)
  assert.equal(t.ratePoints, 2)
})

test('confidence: a week of readings across most of the window is settled; the minimum four is rough', () => {
  const rough = weightTrend([3, 4, 5, 6].map(i => ({ date: day(30 + i), value: 180 })), day(39))
  assert.equal(rough.ratePerWeek, 0)
  assert.equal(rough.confidence, 'rough')
  const three = weightTrend([3, 4, 5].map(i => ({ date: day(30 + i), value: 180 })), day(39))
  assert.equal(three.ratePerWeek, null, 'three readings are an anecdote')
  const settled = weightTrend(series(7, () => 180).map((p, i) => ({ ...p, date: day(26 + i * 2) })), day(39))
  assert.equal(settled.confidence, 'settled', '7 readings over 12 days')
})

test('as-of: readings after `today` are ignored, two readings on one day keep the last, junk is dropped', () => {
  const t = weightTrend([
    { date: day(0), value: 180 },
    { date: day(1), value: 181 },
    { date: day(1), value: 179 }, // the day's last logged weigh-in wins
    { date: day(2), value: Number.NaN },
    { date: day(5), value: 170 } // after today
  ], day(3))
  assert.deepEqual(t.points.map(p => [p.date, p.raw]), [[day(0), 180], [day(1), 179]])
  assert.deepEqual(t.latest, { date: day(1), value: 179 })
  assert.equal(weightTrend([], TODAY).trend, null)
  assert.equal(weightTrend([], TODAY).latest, null)
})

test('the rate prints with its sign and unit; the prompt clause says what it knows', () => {
  assert.equal(fmtRate(-0.4), '−0.4 lb/wk')
  assert.equal(fmtRate(1.25), '+1.3 lb/wk')
  assert.equal(fmtRate(0), '0.0 lb/wk')
  const rows = series(40, i => 185 - (0.5 / 7) * i).map(p => ({ date: p.date, weight_lbs: p.value }))
  assert.equal(weighInsOf([...rows, { date: day(40), weight_lbs: null }, { date: day(41) }]).length, 40, 'rows without a weigh-in are skipped')
  assert.match(describeTrend(weightTrend(weighInsOf(rows), TODAY)), /^trend \d+\.\d lbs, −0\.5 lb\/wk over 14 d \(settled\)$/)
  assert.match(describeTrend(weightTrend(weighInsOf(rows.slice(0, 2)), day(1))), /no rate yet \(2 weigh-ins in 14 d\)/)
  assert.equal(describeTrend(weightTrend([], TODAY)), '')
})
