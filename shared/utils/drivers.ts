// Two cause-and-effect pairs for /journal/trends (follow-ups to audit #43 items 70 + 71): a day's
// sodium against the next morning's systolic, and caffeine after 14:00 against that night's
// sleep. Each pair is a list of points (one per day that has both halves) and a split of those
// points into two groups whose means are compared. It is an association over the days on file,
// stated with its counts; nothing here claims a cause, and a comparison is withheld until both
// groups hold MIN_GROUP days.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { shiftDays } from './dates.ts'
import { lateCaffeineMg, type DrinkLike } from './drinks.ts'
import { dayNutrition, hasFullFigures, isWholeDay, type EstimateIndex, type MealSlot } from './nutrition.ts'
import { localDayOf, workoutStartMs } from './time.ts'

/** Days each side of a split must hold before their means are compared. */
export const MIN_GROUP = 5

export interface DriverPoint {
  /** The day of the cause (the sodium eaten, the caffeine drunk). */
  day: string
  x: number
  y: number
}

export interface DriverJournalDay {
  date: string
  bp_systolic?: number | null
  food?: Partial<Record<MealSlot, string | null | undefined>> | null
  sodas?: DrinkLike[] | null
}

export interface DriverHealthDay {
  date: string
  sleep_total_min?: number | null
  sleep_start?: string | null
}

/**
 * The calendar day a night follows: a night that began at 23:10 on the 4th, or at 00:40 on the
 * 5th, is the night of the 4th (noon-anchored, home timezone). Read from when the night began;
 * a row with no start is taken as dated by its morning, so its night is the day before.
 */
export function nightOf(h: DriverHealthDay): string {
  const ms = workoutStartMs(h.sleep_start)
  return ms != null ? localDayOf(new Date(ms - 12 * 3600_000).toISOString()) : shiftDays(h.date, -1)
}

/** A day's sodium in mg when it is a whole figure — logged through dinner, every meal with figures and a sodium figure — else null. */
export function wholeDaySodium(e: DriverJournalDay, index: EstimateIndex): number | null {
  const n = dayNutrition(e, index)
  return isWholeDay(e) && hasFullFigures(n) && n.sodiumMissing === 0 ? n.sodium_mg : null
}

/** Sodium on a whole-figure day against the systolic reading the next day. */
export function sodiumPoints(journal: readonly DriverJournalDay[], index: EstimateIndex): DriverPoint[] {
  const sys = new Map(journal.flatMap(e => (typeof e.bp_systolic === 'number' ? [[e.date, e.bp_systolic] as const] : [])))
  const out: DriverPoint[] = []
  for (const e of journal) {
    const y = sys.get(shiftDays(e.date, 1))
    if (y == null) continue
    const x = wholeDaySodium(e, index)
    if (x != null) out.push({ day: e.date, x, y })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day))
}

/** The sleep (minutes) of the night that followed each day, by that day. The longer record wins a shared night. */
export function sleepByNight(health: readonly DriverHealthDay[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const h of health) {
    if (typeof h.sleep_total_min !== 'number' || !(h.sleep_total_min > 0)) continue
    const night = nightOf(h)
    if ((out.get(night) ?? 0) < h.sleep_total_min) out.set(night, h.sleep_total_min)
  }
  return out
}

/** Caffeine after 14:00 on a journal day (0 when the day logged none) against that night's sleep. */
export function caffeinePoints(journal: readonly DriverJournalDay[], health: readonly DriverHealthDay[], index: EstimateIndex): DriverPoint[] {
  const sleep = sleepByNight(health)
  const out: DriverPoint[] = []
  for (const e of journal) {
    const y = sleep.get(e.date)
    if (y != null) out.push({ day: e.date, x: lateCaffeineMg(e.sodas, index.drinks), y })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day))
}

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export interface DriverGroup {
  n: number
  /** Mean of y; null for an empty group. */
  mean: number | null
}

export interface DriverSplit {
  threshold: number
  /** x above the threshold. */
  above: DriverGroup
  /** x at or below it. */
  below: DriverGroup
  /** above − below, when both groups hold MIN_GROUP days. */
  diff: number | null
  enough: boolean
}

/** The points split at a threshold on x, with each side's mean of y. */
export function splitAt(points: readonly DriverPoint[], threshold: number): DriverSplit {
  const group = (ys: number[]): DriverGroup => ({ n: ys.length, mean: ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : null })
  const above = group(points.filter(p => p.x > threshold).map(p => p.y))
  const below = group(points.filter(p => p.x <= threshold).map(p => p.y))
  const enough = above.n >= MIN_GROUP && below.n >= MIN_GROUP
  return { threshold, above, below, enough, diff: enough ? above.mean! - below.mean! : null }
}
