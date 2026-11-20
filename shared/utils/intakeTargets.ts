// The water goal and the protein target as fact lines for the digest prompts (audit #44 item 33).
// The prompts' ground rules have long told the model to judge water against "the Water goal fact"
// and protein against "the Protein target fact"; the fact sheet never carried either, so the model
// fell back on "about 100 oz" and on no protein target at all, whatever the profile said. These
// lines are those facts, each with its verdict already worked out — like every other number in
// the sheet, computed here and narrated there. Pure; tests/intakeTargets.test.mjs.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { profileNumber } from './profile.ts'
import { proteinTargetFor, type LeanScan, type ProteinTarget } from './proteinTarget.ts'
import { WATER_DEFAULT_GOAL_OZ, fmtOzValue } from './water.ts'

export interface IntakeTargets {
  waterGoalOz: number
  /** False when no goal is set on the profile and `waterGoalOz` is the tracker's default. */
  waterGoalSet: boolean
  /** Null when neither a fixed target nor a per-lean-pound rule with a scan is on file. */
  protein: ProteinTarget | null
}

/** The targets in force on `asOf`: the profile's settings, the protein one from the latest scan by then when it is lean-based. */
export function intakeTargetsFor(profile: Record<string, string> | null | undefined, scans: readonly LeanScan[], asOf: string): IntakeTargets {
  const set = profileNumber(profile, 'water_goal_oz', 0)
  return {
    waterGoalOz: set > 0 ? set : WATER_DEFAULT_GOAL_OZ,
    waterGoalSet: set > 0,
    protein: proteinTargetFor(profile, scans, asOf)
  }
}

const oz = (n: number) => fmtOzValue(Math.round(n * 10) / 10)

function waterGoalHead(t: IntakeTargets): string {
  return `Water goal: ${oz(t.waterGoalOz)} oz/day${t.waterGoalSet ? '' : ' (the tracker\'s default; none is set on the profile)'}`
}

/** For a day that logged water: "Water goal: 100 oz/day — met (104 oz)" / "— 16 oz short (84 oz)". */
export function waterGoalDayFact(t: IntakeTargets, dayOz: number): string {
  const verdict = dayOz >= t.waterGoalOz ? `met (${oz(dayOz)} oz)` : `${oz(t.waterGoalOz - dayOz)} oz short (${oz(dayOz)} oz)`
  return `${waterGoalHead(t)} — ${verdict}`
}

/** For a period: `dayOz` is the ounces of each day that logged any. "… — met on 2 of the 5 days that logged water". */
export function waterGoalWeekFact(t: IntakeTargets, dayOz: readonly number[]): string {
  const logged = dayOz.filter(v => v > 0)
  if (!logged.length) return waterGoalHead(t)
  const met = logged.filter(v => v >= t.waterGoalOz).length
  return `${waterGoalHead(t)} — met on ${met} of the ${logged.length} day${logged.length === 1 ? '' : 's'} that logged water`
}

function proteinTargetHead(p: ProteinTarget): string {
  const how = p.source === 'fixed' ? 'set by hand' : `${p.perLb} g per lb of lean mass × ${Number(p.lean!.toFixed(1))} lb lean on the ${p.scanDate} DEXA`
  return `Protein target: ${p.grams} g/day (${how})`
}

/**
 * For a day with meal figures. `complete` = logged through to dinner with figures for every meal;
 * anything less is a floor, and a floor under the target says nothing about the day.
 */
export function proteinTargetDayFact(p: ProteinTarget, grams: number, complete: boolean): string {
  const g = Math.round(grams)
  if (!complete) return `${proteinTargetHead(p)} — ${g >= p.grams ? `met already (${g} g so far)` : 'not judged: the day\'s protein figure is a floor, not a total'}`
  return `${proteinTargetHead(p)} — ${g >= p.grams ? `met (${g} g)` : `${p.grams - g} g short (${g} g)`}`
}

/** For a period: the average over its `days` complete days, or null when it has none. */
export function proteinTargetWeekFact(p: ProteinTarget, avgGrams: number | null, days: number): string {
  if (avgGrams == null || days <= 0) return `${proteinTargetHead(p)} — not judged: no day in the period has complete meal figures`
  const g = Math.round(avgGrams)
  const span = `the average of ${g} g over the ${days} complete day${days === 1 ? '' : 's'}`
  return `${proteinTargetHead(p)} — ${g >= p.grams ? `${span} meets it` : `${span} is ${p.grams - g} g short`}`
}
