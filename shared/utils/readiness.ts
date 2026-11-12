// The readiness cue on the home page (audit #43 item 74): should today be an easy day? Two
// signals, both already on file and neither self-reported:
//   - training load: the last 7 days' average Whoop strain against the last 28 days' (the
//     acute:chronic ratio). Well above 1 means the week ran harder than the month it sits in.
//   - HRV: the morning's reading against its own 28-day baseline, in standard deviations. A
//     reading well under baseline is the body saying it has not recovered.
// Either one alone can call an easy day; together they set the wording. The load windows end
// the day BEFORE the day asked about — today's strain is still being earned — and each signal
// needs enough history to mean anything, else it is left out (and with neither, there is no cue).
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { shiftDays } from './dates.ts'

export const ACUTE_DAYS = 7
export const CHRONIC_DAYS = 28
/** Days with a strain figure the 28-day window needs, and the 7-day one. */
export const MIN_CHRONIC_DAYS = 14
export const MIN_ACUTE_DAYS = 4
/** Earlier HRV readings the baseline needs. */
export const MIN_HRV_READINGS = 10

/** Acute:chronic thresholds: at or above HIGH the week is a spike, at or above RAMP it is building, under LOW there is room. */
export const LOAD_HIGH = 1.5
export const LOAD_RAMP = 1.3
export const LOAD_LOW = 0.8
/** HRV against baseline, in SD: at or under LOW it is suppressed, at or under DIP it is soft. */
export const HRV_LOW_SD = -1
export const HRV_DIP_SD = -0.5

export interface ReadinessJournalDay {
  date: string
  hrv?: number | null
}

export interface ReadinessHealthDay {
  date: string
  strain?: number | null
}

export type ReadinessVerdict = 'easy' | 'steady' | 'go'

export interface Readiness {
  verdict: ReadinessVerdict
  /** "easy day" · "steady day" · "good to train" · "room to push" */
  headline: string
  /** One clause per signal that had enough history. */
  reasons: string[]
  load: { acute: number, chronic: number, ratio: number, acuteDays: number, chronicDays: number } | null
  hrv: { value: number, date: string, mean: number, sd: number, z: number, n: number } | null
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/** The 7-day average strain against the 28-day, over the days before `asOf`; null without enough days. */
export function loadRatio(health: readonly ReadinessHealthDay[], asOf: string): Readiness['load'] {
  const to = shiftDays(asOf, -1)
  const strainFrom = (days: number) => health
    .filter(h => h.date >= shiftDays(asOf, -days) && h.date <= to && typeof h.strain === 'number' && h.strain >= 0)
    .map(h => h.strain as number)
  const acute = strainFrom(ACUTE_DAYS)
  const chronic = strainFrom(CHRONIC_DAYS)
  if (acute.length < MIN_ACUTE_DAYS || chronic.length < MIN_CHRONIC_DAYS) return null
  const chronicAvg = avg(chronic)
  if (!(chronicAvg > 0)) return null
  const acuteAvg = avg(acute)
  return { acute: acuteAvg, chronic: chronicAvg, ratio: acuteAvg / chronicAvg, acuteDays: acute.length, chronicDays: chronic.length }
}

/** The reading on `asOf` (or the day before) against the readings of the 28 days before it; null without enough of them. */
export function hrvBaseline(journal: readonly ReadinessJournalDay[], asOf: string): Readiness['hrv'] {
  const readings = journal.filter(e => typeof e.hrv === 'number' && e.hrv > 0).sort((a, b) => a.date.localeCompare(b.date))
  const current = readings.findLast(e => e.date <= asOf && e.date >= shiftDays(asOf, -1))
  if (!current) return null
  const base = readings.filter(e => e.date < current.date && e.date >= shiftDays(current.date, -CHRONIC_DAYS)).map(e => e.hrv as number)
  if (base.length < MIN_HRV_READINGS) return null
  const mean = avg(base)
  const sd = Math.sqrt(base.reduce((s, x) => s + (x - mean) ** 2, 0) / (base.length - 1))
  const value = current.hrv as number
  return { value, date: current.date, mean, sd, z: sd > 0 ? (value - mean) / sd : 0, n: base.length }
}

/** The cue for `asOf`, or null when neither signal has enough history. */
export function readiness(journal: readonly ReadinessJournalDay[], health: readonly ReadinessHealthDay[], asOf: string): Readiness | null {
  const load = loadRatio(health, asOf)
  const hrv = hrvBaseline(journal, asOf)
  if (!load && !hrv) return null

  const hrvLow = hrv != null && hrv.z <= HRV_LOW_SD
  const hrvDip = hrv != null && hrv.z <= HRV_DIP_SD
  const loadHigh = load != null && load.ratio >= LOAD_HIGH
  const loadRamp = load != null && load.ratio >= LOAD_RAMP
  const loadLow = load != null && load.ratio < LOAD_LOW

  const verdict: ReadinessVerdict = hrvLow || loadHigh || (hrvDip && loadRamp) ? 'easy' : hrvDip || loadRamp ? 'steady' : 'go'
  const headline = verdict === 'easy' ? 'easy day' : verdict === 'steady' ? 'steady day' : loadLow ? 'room to push' : 'good to train'

  const reasons: string[] = []
  if (hrv) {
    const size = Math.abs(hrv.z)
    reasons.push(size < 0.5
      ? `HRV ${Math.round(hrv.value)} ms is at your 28-day ${Math.round(hrv.mean)}`
      : `HRV ${Math.round(hrv.value)} ms is ${size.toFixed(1)} SD ${hrv.z < 0 ? 'under' : 'over'} your 28-day ${Math.round(hrv.mean)}`)
  }
  if (load) {
    reasons.push(`7-day strain ${load.acute.toFixed(1)} is ${load.ratio.toFixed(2)}× your 4-week ${load.chronic.toFixed(1)}`)
  }
  return { verdict, headline, reasons, load, hrv }
}
