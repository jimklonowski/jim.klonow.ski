// Maintenance calories from the food log and the scale (audit #43 item 62). What the body burned
// over a window is what it ate minus what it stored, and the store shows up as the trend weight
// moving: `maintenance ≈ mean intake − Δtrend × kcal per lb ÷ days`. That reads the log against
// the scale instead of a formula or the watch's guess, so a log that under-counts by a steady
// amount gives a maintenance that is low by the same amount — and a target set from it is met by
// the same log. Nothing here is a measurement of expenditure; it is an energy balance.
//
// Intake: only days logged through dinner with figures on every meal count (the rule the 7-day
// average and the trends calorie line use), and the window needs MIN_COVERAGE of its days logged
// that way or it says so instead of guessing. Missing days are left out, never filled in.
//
// Weight: the trend from weightTrend.ts (a gap-aware EMA), read as of the day before the window
// and as of its last day, so the delta spans the window and a salty dinner moves nothing. Both
// ends need a weigh-in within WEIGH_IN_SLACK_DAYS or there is no delta to read.
//
// The price of a pound: 3,500 kcal assumes the change is fat. Fat mass carries ~9,400 kcal/kg
// and lean soft tissue ~1,800 kcal/kg (Hall 2008), so a recomposition — lean up, fat flat or
// down — stores far less than 3,500 per pound gained. Between two DEXA scans the change in fat
// and lean is known, which prices that period's pound; the latest such period prices the
// current window, clamped between lean tissue and fat, and only while the window's weight moves
// the same way the scans' did (a pound lost on a cut is not priced by a bulk's recomposition).
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { diffDays, roundTo, shiftDays } from './dates.ts'
import type { TrendPoint } from './weightTrend.ts'

export const ENERGY_WINDOW_DAYS = 28
/** Share of the window's days that must be logged whole before a maintenance figure is shown. */
export const MIN_COVERAGE = 0.7
/** Each end of the window needs a weigh-in this close for the trend there to be read. */
export const WEIGH_IN_SLACK_DAYS = 7
/** The classic figure: a pound of body weight as if it were all adipose tissue. */
export const KCAL_PER_LB_DEFAULT = 3500
/** Fat mass, 9,400 kcal/kg, and lean soft tissue, 1,800 kcal/kg (Hall 2008), per pound. */
export const KCAL_PER_LB_FAT = 4264
export const KCAL_PER_LB_LEAN = 816
/** A scan pair prices a pound only across at least this much mass change and this many days. */
export const MIN_CALIBRATION_LBS = 3
export const MIN_CALIBRATION_DAYS = 28

/** One day logged whole (dinner in, every meal with figures), its calories with sodas. */
export interface DayIntake {
  date: string
  kcal: number
}

/** The DEXA figures this reads: whole-body fat and lean mass, lbs. */
export interface ScanMass {
  date: string
  fat_lbs: number | null | undefined
  lean_lbs: number | null | undefined
}

export interface Calibration {
  from: string
  to: string
  days: number
  fatDelta: number
  leanDelta: number
  massDelta: number
  /** Energy stored over the period, kcal (fat and lean each at their own price). */
  storedKcal: number
  /** storedKcal ÷ massDelta before the clamp; null when the mass barely moved. */
  rawKcalPerLb: number | null
  /** The price applied to a window's pound: rawKcalPerLb clamped to [lean, fat]; null when unusable. */
  kcalPerLb: number | null
}

/**
 * The latest pair of consecutive scans that both carry fat and lean mass and sit at least
 * MIN_CALIBRATION_DAYS apart; null with fewer than two such scans. Its `kcalPerLb` is null when
 * the mass moved less than MIN_CALIBRATION_LBS — the ratio of two small numbers prices nothing.
 */
export function dexaCalibration(scans: readonly ScanMass[]): Calibration | null {
  const usable = scans
    .filter(s => s.fat_lbs != null && s.lean_lbs != null && Number.isFinite(s.fat_lbs) && Number.isFinite(s.lean_lbs))
    .sort((a, b) => a.date.localeCompare(b.date))
  for (let i = usable.length - 1; i > 0; i--) {
    const b = usable[i]!
    // The newest earlier scan far enough back from this one.
    const a = usable.slice(0, i).reverse().find(s => diffDays(s.date, b.date) >= MIN_CALIBRATION_DAYS)
    if (!a) continue
    const fatDelta = roundTo(b.fat_lbs! - a.fat_lbs!, 1)
    const leanDelta = roundTo(b.lean_lbs! - a.lean_lbs!, 1)
    const massDelta = roundTo(fatDelta + leanDelta, 1)
    const storedKcal = Math.round(fatDelta * KCAL_PER_LB_FAT + leanDelta * KCAL_PER_LB_LEAN)
    const rawKcalPerLb = Math.abs(massDelta) >= MIN_CALIBRATION_LBS ? Math.round(storedKcal / massDelta) : null
    const kcalPerLb = rawKcalPerLb == null ? null : Math.min(KCAL_PER_LB_FAT, Math.max(KCAL_PER_LB_LEAN, rawKcalPerLb))
    return { from: a.date, to: b.date, days: diffDays(a.date, b.date), fatDelta, leanDelta, massDelta, storedKcal, rawKcalPerLb, kcalPerLb }
  }
  return null
}

/** The trend as of `date`: the last weigh-in's trend on or before it, if one is within the slack. */
export function trendAsOf(points: readonly TrendPoint[], date: string): number | null {
  let found: TrendPoint | null = null
  for (const p of points) {
    if (p.date > date) break
    found = p
  }
  if (!found || diffDays(found.date, date) > WEIGH_IN_SLACK_DAYS) return null
  return found.trend
}

export type PriceSource = 'dexa' | 'default'

export type BalanceStatus = 'ok' | 'few-days' | 'no-weight'

export interface EnergyBalance {
  from: string
  to: string
  windowDays: number
  /** Days in the window logged whole with every meal figured. */
  loggedDays: number
  coverage: number
  /** Mean kcal over the logged days; null with none. */
  intakeKcal: number | null
  /** Trend lbs at the window's end minus the day before it; null without weigh-ins at both ends. */
  weightDelta: number | null
  kcalPerLb: number
  source: PriceSource
  /** Why the default price applied though a calibration exists: the scans moved the other way. */
  directionMismatch: boolean
  /** kcal/day the weight change stored (negative = drawn from stores). */
  storedKcalPerDay: number | null
  /** Rounded to 10 kcal; null unless status is 'ok'. */
  maintenanceKcal: number | null
  status: BalanceStatus
}

/** The price of a pound for a window whose trend moved `weightDelta`. */
function priceFor(weightDelta: number | null, calibration: Calibration | null): { kcalPerLb: number, source: PriceSource, directionMismatch: boolean } {
  if (!calibration || calibration.kcalPerLb == null) return { kcalPerLb: KCAL_PER_LB_DEFAULT, source: 'default', directionMismatch: false }
  if (weightDelta != null && weightDelta !== 0 && Math.sign(weightDelta) !== Math.sign(calibration.massDelta)) {
    return { kcalPerLb: KCAL_PER_LB_DEFAULT, source: 'default', directionMismatch: true }
  }
  return { kcalPerLb: calibration.kcalPerLb, source: 'dexa', directionMismatch: false }
}

/**
 * The balance over the `windowDays` days ending `to` (inclusive). `intake` is every whole day
 * (any order, any span); `points` the weight trend over the whole history.
 */
export function energyBalance(
  intake: readonly DayIntake[],
  points: readonly TrendPoint[],
  calibration: Calibration | null,
  to: string,
  windowDays = ENERGY_WINDOW_DAYS
): EnergyBalance {
  const from = shiftDays(to, -(windowDays - 1))
  const inWindow = intake.filter(d => d.date >= from && d.date <= to && Number.isFinite(d.kcal))
  const byDate = new Map(inWindow.map(d => [d.date, d.kcal]))
  const loggedDays = byDate.size
  const coverage = roundTo(loggedDays / windowDays, 2)
  const intakeKcal = loggedDays ? Math.round([...byDate.values()].reduce((s, k) => s + k, 0) / loggedDays) : null

  const before = trendAsOf(points, shiftDays(from, -1))
  const after = trendAsOf(points, to)
  const weightDelta = before != null && after != null ? roundTo(after - before, 2) : null

  const price = priceFor(weightDelta, calibration)
  const storedKcalPerDay = weightDelta != null ? Math.round((weightDelta * price.kcalPerLb) / windowDays) : null

  const status: BalanceStatus = loggedDays / windowDays < MIN_COVERAGE ? 'few-days' : weightDelta == null ? 'no-weight' : 'ok'
  const maintenanceKcal = status === 'ok' ? Math.round((intakeKcal! - storedKcalPerDay!) / 10) * 10 : null

  return { from, to, windowDays, loggedDays, coverage, intakeKcal, weightDelta, ...price, storedKcalPerDay, maintenanceKcal, status }
}

export interface ScanPeriodBalance {
  calibration: Calibration
  loggedDays: number
  coverage: number
  intakeKcal: number | null
  storedKcalPerDay: number
  /** Null when the period wasn't logged well enough to read. */
  maintenanceKcal: number | null
}

/**
 * Maintenance across the calibration period itself — the best-grounded figure there is, since
 * the stored energy is the scans' own fat and lean change, not a priced trend. The period runs
 * from the day after the first scan through the second.
 */
export function scanPeriodBalance(intake: readonly DayIntake[], calibration: Calibration): ScanPeriodBalance {
  const from = shiftDays(calibration.from, 1)
  const days = calibration.days
  const byDate = new Map(intake.filter(d => d.date >= from && d.date <= calibration.to && Number.isFinite(d.kcal)).map(d => [d.date, d.kcal]))
  const loggedDays = byDate.size
  const coverage = days ? roundTo(loggedDays / days, 2) : 0
  const intakeKcal = loggedDays ? Math.round([...byDate.values()].reduce((s, k) => s + k, 0) / loggedDays) : null
  const storedKcalPerDay = days ? Math.round(calibration.storedKcal / days) : 0
  const maintenanceKcal = intakeKcal != null && days && loggedDays / days >= MIN_COVERAGE
    ? Math.round((intakeKcal - storedKcalPerDay) / 10) * 10
    : null
  return { calibration, loggedDays, coverage, intakeKcal, storedKcalPerDay, maintenanceKcal }
}

/** One day's Apple expenditure figures (health_metrics). */
export interface AppleEnergyDay {
  date: string
  active_kcal?: number | null
  basal_kcal?: number | null
}

/**
 * The watch's own expenditure over the same window, for comparison only: mean active + resting
 * energy across the days that carry both (a day without the watch reads low, not zero, so a
 * half-figured day is left out). Null with no such day.
 */
export function appleExpenditure(rows: readonly AppleEnergyDay[], from: string, to: string): { kcal: number, days: number } | null {
  const days = rows.filter(r => r.date >= from && r.date <= to && r.active_kcal != null && r.basal_kcal != null)
  if (!days.length) return null
  return { kcal: Math.round(days.reduce((s, r) => s + r.active_kcal! + r.basal_kcal!, 0) / days.length), days: days.length }
}

/** "+35 kcal/day stored" / "−210 kcal/day from stores" — one spelling for the caption and prompts. */
export function fmtStored(kcalPerDay: number): string {
  if (kcalPerDay === 0) return '0 kcal/day stored'
  return kcalPerDay > 0 ? `+${kcalPerDay} kcal/day stored` : `−${Math.abs(kcalPerDay)} kcal/day from stores`
}
