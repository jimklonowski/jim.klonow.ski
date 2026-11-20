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

// --- two more of the day's intake lines (audit #44 item 34) ---

/** What the sodium and fibre line reads of a day's nutrition (DayNutrition has all of it). */
export interface SodiumFibreFigures {
  sodium_mg: number
  sodiumMissing: number
  fiber_g: number
  fiberMissing: number
}

/** The sodium guideline the line names, mg a day. */
export const SODIUM_GUIDELINE_MG = 2300

/**
 * "Sodium and fibre: sodium ≈ 1,840 mg (a floor: …); fibre ≈ 22 g." — or '' with neither figure.
 * A figure is complete only when every logged meal carries one AND the day was logged through to
 * dinner (`wholeDay`). The line used to mark a floor for a missing figure alone, so breakfast and
 * lunch with full figures read as the whole day's sodium, and the model compared half a day with
 * the guideline as told to do only for "a complete figure".
 */
export function sodiumFibreFact(n: SodiumFibreFigures, wholeDay: boolean): string {
  if (!n.sodium_mg && !n.fiber_g) return ''
  const floor = (missing: number, what: string) => {
    const why = [
      missing ? `${missing} meal${missing === 1 ? '' : 's'} without ${what}` : '',
      wholeDay ? '' : 'the day is not logged through to dinner'
    ].filter(Boolean)
    return why.length ? ` (a floor: ${why.join(', and ')})` : ''
  }
  const parts = [
    n.sodium_mg ? `sodium ≈ ${Math.round(n.sodium_mg)} mg${floor(n.sodiumMissing, 'a sodium figure')}` : '',
    n.fiber_g ? `fibre ≈ ${Math.round(n.fiber_g)} g${floor(n.fiberMissing, 'a fibre figure')}` : ''
  ].filter(Boolean)
  const sodiumComplete = !!n.sodium_mg && wholeDay && n.sodiumMissing === 0
  const guide = !n.sodium_mg
    ? ''
    : sodiumComplete
      ? ` The ${SODIUM_GUIDELINE_MG.toLocaleString('en-US')} mg/day sodium guideline is the reference for this complete figure.`
      : ` The sodium figure is a floor: do not compare it with the ${SODIUM_GUIDELINE_MG.toLocaleString('en-US')} mg/day guideline, except to say so if it is already over.`
  return `Sodium and fibre: ${parts.join('; ')}.${guide}`
}

/**
 * One day's caffeine line: "Caffeine: 150 mg from logged drinks, last at 16:20, 109 mg of it
 * after 14:00 (late caffeine costs sleep)". `last` is null when no caffeinated drink carried a
 * time (a row saved without one), and the line then leaves the clause out — it used to print
 * "last at null".
 */
export function caffeineDayFact(caffeineMg: number, last: string | null | undefined, lateMg: number, lateHour: number): string {
  if (!(caffeineMg > 0)) return ''
  return `Caffeine: ${Math.round(caffeineMg)} mg from logged drinks${last ? `, last at ${last}` : ''}${lateMg ? `, ${Math.round(lateMg)} mg of it after ${lateHour}:00 (late caffeine costs sleep)` : ''}`
}

/** For a period: the average over its `days` complete days, or null when it has none. */
export function proteinTargetWeekFact(p: ProteinTarget, avgGrams: number | null, days: number): string {
  if (avgGrams == null || days <= 0) return `${proteinTargetHead(p)} — not judged: no day in the period has complete meal figures`
  const g = Math.round(avgGrams)
  const span = `the average of ${g} g over the ${days} complete day${days === 1 ? '' : 's'}`
  return `${proteinTargetHead(p)} — ${g >= p.grams ? `${span} meets it` : `${span} is ${p.grams - g} g short`}`
}
