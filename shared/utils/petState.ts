// TICKER's read of the Whoop rows — the one copy (audit #42 item 19). The home page and /ticker
// each had their own: home entered "sluggish" below six hours and cleared it only at seven, the
// ticker page used a flat seven-hour line; home took the newest NON-NULL recovery, the ticker the
// last row's (null on a day Whoop hadn't scored yet). Same pet, two moods. Plain TS, no imports,
// so tests/petState.test.mjs runs it in node.

export interface SleepRecoveryRow {
  date: string
  sleep_total_min?: number | null
  recovery_score?: number | null
}

/** A night under this is a short one: the pet turns sluggish. */
export const SLEEP_SHORT_MIN = 360
/** A night at or over this clears it. Between the two, yesterday's state holds (hysteresis). */
export const SLEEP_RESTED_MIN = 420

const byDate = <T extends { date: string }>(rows: readonly T[]) => [...rows].sort((a, b) => a.date.localeCompare(b.date))

/** The newest row's non-null value of `pick`, whatever day it landed on. */
function newest<T extends { date: string }>(rows: readonly T[], pick: (row: T) => number | null | undefined): number | null {
  const sorted = byDate(rows)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const v = pick(sorted[i]!)
    if (v != null) return v
  }
  return null
}

/** Newest scored recovery, skipping days Whoop hasn't scored yet. */
export function latestRecovery(rows: readonly SleepRecoveryRow[]): number | null {
  return newest(rows, r => r.recovery_score)
}

/** Newest night with a sleep total. */
export function latestSleepMin(rows: readonly SleepRecoveryRow[]): number | null {
  return newest(rows, r => r.sleep_total_min)
}

/**
 * Short-sleep state with hysteresis, walked in date order: a night under SLEEP_SHORT_MIN enters
 * it, only a night at or over SLEEP_RESTED_MIN clears it, nights between keep the state as it
 * was, nights without a total are skipped.
 */
export function isSluggish(rows: readonly SleepRecoveryRow[]): boolean {
  let state = false
  for (const r of byDate(rows)) {
    const min = r.sleep_total_min
    if (min == null) continue
    if (min < SLEEP_SHORT_MIN) state = true
    else if (min >= SLEEP_RESTED_MIN) state = false
  }
  return state
}
