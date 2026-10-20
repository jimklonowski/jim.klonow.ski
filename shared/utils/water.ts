// Water intake. Each tap on the tracker stores the ounces it meant ({time, oz}), so the day's
// total is a plain sum — unlike sodas, where the volume has to be parsed out of a size label.
//
// The two settings live in the profile table (shared/utils/profile.ts, keys `water_goal_oz` and
// `cup_oz`) as strings, like every other wallet-card fact; the readers below turn them back into
// numbers and fall back to the defaults when unset or unparseable, so a blank profile (the demo
// sandbox, a fresh install) still gets a working tracker.
import { profileNumber } from './profile.ts'

/** A sensible daily target to start from; Jim's own number goes in the profile. */
export const WATER_DEFAULT_GOAL_OZ = 100
/** The nominal size of the cup — set it lower once it's full of ice. */
export const WATER_DEFAULT_CUP_OZ = 12

/** Hard ceiling for one logged pour: a 64 oz jug is plausible, 200 oz in one go is a typo. */
export const WATER_MAX_OZ_PER_ENTRY = 200

export interface WaterTotals {
  /** Taps logged. */
  count: number
  /** Ounces, summed and rounded to one decimal. */
  oz: number
}

export function waterTotals(entries: Array<{ oz?: number | null }> | null | undefined): WaterTotals {
  let oz = 0
  let count = 0
  for (const e of entries ?? []) {
    if (typeof e.oz !== 'number' || !Number.isFinite(e.oz)) continue
    oz += e.oz
    count++
  }
  return { count, oz: Math.round(oz * 10) / 10 }
}

/** "84 oz" / "84.5 oz" — '' when nothing was logged. */
export function fmtWaterOz(oz: number): string {
  if (!oz) return ''
  return `${Number.isInteger(oz) ? oz : oz.toFixed(1)} oz`
}

/** The goal or cup size from the profile, or the fallback — see profileNumber. */
export function waterSetting(profile: Record<string, string> | null | undefined, key: string, fallback: number): number {
  return profileNumber(profile, key, fallback)
}

/** Share of the goal reached, 0–1, capped at 1 so a big day doesn't overflow a progress bar. */
export function waterProgress(oz: number, goalOz: number): number {
  if (goalOz <= 0) return 0
  return Math.min(1, Math.max(0, oz / goalOz))
}
