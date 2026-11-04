// Trend weight and its rate (audit #43 item 55). A morning weigh-in swings a couple of pounds on
// water, sodium and when the last meal was, so one reading — or a delta between two readings —
// is mostly noise; what the recomp and Primo decisions need is the true weight underneath and
// how fast it is moving. Every surface that talks about weight (home and hub tiles, the trends
// chart, the cycle signals, the digests, the /ask fact sheet) reads these two numbers from here,
// so they never disagree.
//
// Trend: an exponential moving average whose step scales with the days elapsed since the last
// weigh-in — `α = 1 − e^(−Δdays/τ)`, τ = TREND_TAU_DAYS. A fixed per-sample α over-trusts the
// first reading after a ten-day hole and over-smooths a daily streak; this way a reading after a
// long gap pulls the trend most of the way to it and a daily reading nudges it about a tenth. A
// reading far off BOTH the trend and the previous reading (a flight, a cheat day) is kept at
// half weight; the next reading that agrees with it counts in full, so a real step is followed
// within days, while on a fast climb — where every reading sits ahead of the lagging trend —
// consecutive readings agree with each other and nothing is discounted.
//
// Rate: the least-squares slope of the RAW weigh-ins over the trailing RATE_WINDOW_DAYS, in
// lbs/week — the regression is its own smoother and, unlike the trend, has no lag, so a climb
// one week old already reads at about half its slope (the water-retention tell the cycle watch
// is for). Only with MIN_WINDOW_POINTS or more weigh-ins inside the window; `settled` once the
// window holds a week of readings across most of its span, `rough` before that.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { diffDays, roundTo, shiftDays } from './dates.ts'
import { MIN_WINDOW_POINTS } from './metricNoise.ts'

export interface WeighIn {
  date: string
  value: number
}

export interface TrendPoint {
  date: string
  raw: number
  trend: number
}

export type RateConfidence = 'settled' | 'rough'

export interface WeightTrend {
  /** One per weigh-in day on or before `today`, oldest first, the trend carried through them. */
  points: TrendPoint[]
  /** The trend as of `today` (the last point's), one decimal; null with no weigh-ins. */
  trend: number | null
  /** The newest weigh-in on or before `today`. */
  latest: WeighIn | null
  /** lbs/week, one decimal; null below MIN_WINDOW_POINTS readings in the window. */
  ratePerWeek: number | null
  confidence: RateConfidence | null
  /** Weigh-ins inside the rate window. */
  ratePoints: number
}

/** Days for the trend to close ~63 % of a step. */
export const TREND_TAU_DAYS = 10
export const RATE_WINDOW_DAYS = 14
/** A reading this far off the trend AND the previous reading counts half: a spike, until the next reading agrees. */
export const OUTLIER_LBS = 4
/** Sustained change this fast is the water-retention tell on-cycle — watch, then flag. */
export const RATE_WATCH_LBS_WK = 1.5
export const RATE_FLAG_LBS_WK = 2.5
const SETTLED_POINTS = 7
const SETTLED_SPAN_DAYS = 10

export function weightTrend(
  weighIns: readonly WeighIn[],
  today: string,
  { tau = TREND_TAU_DAYS, windowDays = RATE_WINDOW_DAYS } = {}
): WeightTrend {
  // One reading per day (the last logged wins), finite, on or before today, oldest first.
  const byDate = new Map<string, number>()
  for (const w of weighIns) if (Number.isFinite(w.value) && w.date <= today) byDate.set(w.date, w.value)
  const sorted = [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date))

  const points: TrendPoint[] = []
  let trend = 0
  for (const [i, { date, value }] of sorted.entries()) {
    if (i === 0) {
      trend = value
    }
    else {
      const previous = sorted[i - 1]!
      const dt = Math.max(1, diffDays(previous.date, date))
      let alpha = 1 - Math.exp(-dt / tau)
      if (Math.abs(value - trend) > OUTLIER_LBS && Math.abs(value - previous.value) > OUTLIER_LBS) alpha /= 2
      trend += alpha * (value - trend)
    }
    points.push({ date, raw: value, trend: roundTo(trend, 2) })
  }

  // The rate: ordinary least squares over the raw weigh-ins inside the window, days on x.
  const from = shiftDays(today, -(windowDays - 1))
  const inWindow = points.filter(p => p.date >= from)
  let ratePerWeek: number | null = null
  let confidence: RateConfidence | null = null
  if (inWindow.length >= MIN_WINDOW_POINTS) {
    const xs = inWindow.map(p => diffDays(from, p.date))
    const ys = inWindow.map(p => p.raw)
    const n = xs.length
    const mx = xs.reduce((a, b) => a + b, 0) / n
    const my = ys.reduce((a, b) => a + b, 0) / n
    let sxy = 0
    let sxx = 0
    for (let i = 0; i < n; i++) {
      sxy += (xs[i]! - mx) * (ys[i]! - my)
      sxx += (xs[i]! - mx) ** 2
    }
    const slope = sxx ? sxy / sxx : 0
    ratePerWeek = roundTo(slope * 7, 1)
    const span = diffDays(inWindow[0]!.date, inWindow[n - 1]!.date)
    confidence = n >= SETTLED_POINTS && span >= SETTLED_SPAN_DAYS ? 'settled' : 'rough'
  }

  return {
    points,
    trend: points.length ? roundTo(points[points.length - 1]!.trend, 1) : null,
    latest: sorted[sorted.length - 1] ?? null,
    ratePerWeek,
    confidence,
    ratePoints: inWindow.length
  }
}

/** "−0.4 lb/wk" / "+1.2 lb/wk" / "0.0 lb/wk" — one spelling for every caption and prompt line. */
export function fmtRate(ratePerWeek: number): string {
  const sign = ratePerWeek > 0 ? '+' : ratePerWeek < 0 ? '−' : ''
  return `${sign}${Math.abs(ratePerWeek).toFixed(1)} lb/wk`
}

/** The weigh-ins in a run of journal rows (any shape with `date` and `weight_lbs`). */
export function weighInsOf(rows: ReadonlyArray<{ date: string, weight_lbs?: number | null }>): WeighIn[] {
  return rows.flatMap(r => (r.weight_lbs != null ? [{ date: r.date, value: r.weight_lbs }] : []))
}

/** Six weeks of weigh-ins: enough for the trend to settle and the rate window to fill. */
export const TREND_LOOKBACK_DAYS = 42

/**
 * The trend as one prompt clause: "trend 182.1 lbs, −0.3 lb/wk over 14 d (settled)", or with
 * too few weigh-ins "trend 182.1 lbs, no rate yet (2 weigh-ins in 14 d)"; '' with no weigh-ins.
 */
export function describeTrend(wt: WeightTrend): string {
  if (wt.trend == null) return ''
  const rate = wt.ratePerWeek != null
    ? `${fmtRate(wt.ratePerWeek)} over ${RATE_WINDOW_DAYS} d (${wt.confidence})`
    : `no rate yet (${wt.ratePoints} weigh-in${wt.ratePoints === 1 ? '' : 's'} in ${RATE_WINDOW_DAYS} d)`
  return `trend ${wt.trend} lbs, ${rate}`
}
