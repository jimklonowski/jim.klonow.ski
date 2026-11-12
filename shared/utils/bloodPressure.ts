// A blood-pressure reading is a PAIR (audit #42 item 25). The ask-the-data weekly line averaged
// systolic over any day that had one and diastolic over whatever was there, defaulting the
// missing side to 0 — so a week whose only cuff day lacked a diastolic read "bp 128/0" and the
// model narrated it. The daily line printed "bp 128/null" the same way. One rule for all of it:
// both figures present and above zero, or no reading. Plain TS so tests can run it.

import { shiftDays } from './dates.ts'

export interface BpLike {
  bp_systolic?: number | null
  bp_diastolic?: number | null
}

export interface BpReading {
  systolic: number
  diastolic: number
}

/** The row's reading when both figures are real; null for a half-logged or zeroed pair. */
export function bpReading(row: BpLike | null | undefined): BpReading | null {
  const s = row?.bp_systolic
  const d = row?.bp_diastolic
  if (typeof s !== 'number' || typeof d !== 'number' || !(s > 0) || !(d > 0)) return null
  return { systolic: s, diastolic: d }
}

/** "128/78" for a row with a full reading, else null. */
export function bpLabel(row: BpLike | null | undefined): string | null {
  const r = bpReading(row)
  return r ? `${r.systolic}/${r.diastolic}` : null
}

/** The mean reading over the rows that have a full one, as "sys/dia" (whole numbers), else null. */
export function bpAverageLabel(rows: readonly BpLike[]): string | null {
  const readings = rows.map(bpReading).filter((r): r is BpReading => r != null)
  if (!readings.length) return null
  const mean = (pick: (r: BpReading) => number) => Math.round(readings.reduce((sum, r) => sum + pick(r), 0) / readings.length)
  return `${mean(r => r.systolic)}/${mean(r => r.diastolic)}`
}

// --- AHA categories, the 7-day average and the goal (audit #43 item 83) ---
// One cuff reading is noise (caffeine, a bad night, the arm's position); the figure a clinician
// reads is the average of a week of home readings, against the 2017 ACC/AHA categories:
//   normal    < 120 and < 80
//   elevated  120–129 and < 80
//   stage 1   130–139 or 80–89
//   stage 2   ≥ 140 or ≥ 90
//   crisis    > 180 or > 120
// The higher of the two figures' categories is the reading's.

export type BpCategoryKey = 'normal' | 'elevated' | 'stage1' | 'stage2' | 'crisis'

export interface BpCategory {
  key: BpCategoryKey
  label: string
  tone: 'ok' | 'warn' | 'danger'
}

const BP_CATEGORIES: Record<BpCategoryKey, BpCategory> = {
  normal: { key: 'normal', label: 'normal', tone: 'ok' },
  elevated: { key: 'elevated', label: 'elevated', tone: 'warn' },
  stage1: { key: 'stage1', label: 'stage 1 hypertension', tone: 'warn' },
  stage2: { key: 'stage2', label: 'stage 2 hypertension', tone: 'danger' },
  crisis: { key: 'crisis', label: 'hypertensive crisis range', tone: 'danger' }
}

export function bpCategory(r: BpReading): BpCategory {
  if (r.systolic > 180 || r.diastolic > 120) return BP_CATEGORIES.crisis
  if (r.systolic >= 140 || r.diastolic >= 90) return BP_CATEGORIES.stage2
  if (r.systolic >= 130 || r.diastolic >= 80) return BP_CATEGORIES.stage1
  if (r.systolic >= 120) return BP_CATEGORIES.elevated
  return BP_CATEGORIES.normal
}

/** The systolic bands a chart tints (normal is left clear), and the diastolic line where stage 1 starts. */
export const BP_SYSTOLIC_BANDS: ReadonlyArray<{ key: BpCategoryKey, from: number, to: number }> = [
  { key: 'elevated', from: 120, to: 130 },
  { key: 'stage1', from: 130, to: 140 },
  { key: 'stage2', from: 140, to: 180 }
]
export const BP_DIASTOLIC_STAGE1 = 80

/** The goal when none is set: under the stage 1 line on both figures. */
export const BP_DEFAULT_GOAL: BpReading = { systolic: 130, diastolic: 80 }

/** The profile's `bp_goal` ("125/80") as a reading, or the default when unset or unreadable. */
export function bpGoal(text: string | null | undefined): BpReading {
  const m = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(text ?? '')
  return m ? { systolic: Number(m[1]), diastolic: Number(m[2]) } : BP_DEFAULT_GOAL
}

export interface BpWeek {
  /** The mean of the full readings in the window, whole numbers. */
  systolic: number
  diastolic: number
  /** How many days in the window had a full reading. */
  n: number
  days: number
  category: BpCategory
  goal: BpReading
  /** Both figures under the goal's. */
  met: boolean
}

/**
 * The average of the full readings in the `days` days ending `asOf` (inclusive), read against
 * the AHA categories and the goal; null when the window has none. The journal keeps one reading
 * a day — the morning cuff — so this is the average of up to `days` readings.
 */
export function bpWeekAverage(rows: ReadonlyArray<BpLike & { date: string }>, asOf: string, goal: BpReading = BP_DEFAULT_GOAL, days = 7): BpWeek | null {
  const from = shiftDays(asOf, -(days - 1))
  const readings = rows.filter(r => r.date >= from && r.date <= asOf).map(bpReading).filter((r): r is BpReading => r != null)
  if (!readings.length) return null
  const mean = (pick: (r: BpReading) => number) => Math.round(readings.reduce((sum, r) => sum + pick(r), 0) / readings.length)
  const avg = { systolic: mean(r => r.systolic), diastolic: mean(r => r.diastolic) }
  return { ...avg, n: readings.length, days, category: bpCategory(avg), goal, met: avg.systolic < goal.systolic && avg.diastolic < goal.diastolic }
}
