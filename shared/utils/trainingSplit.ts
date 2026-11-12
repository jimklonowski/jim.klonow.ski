// Nutrition on training days against rest days (audit #43 item 80). The audit wrote it as
// "lift day vs rest day"; Jim's training is Peloton rides, weighted dips and pull-ups, so the
// split is any real session against none. A training day is one with at least
// TRAINING_MIN_MINUTES of sessions that are training — a commute, yard work, a stretch or a
// round of disc golf is activity, not a session to fuel. Only days logged whole with figures on
// every meal are averaged (the same rule as every other intake average), and a comparison is
// withheld until each side has SPLIT_MIN_DAYS.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { dayNutrition, hasFullFigures, isDayDone, isWholeDay, type EstimateIndex, type MealSlot } from './nutrition.ts'
import type { DrinkLike } from './drinks.ts'

/** Minutes of training sessions that make a day a training day. */
export const TRAINING_MIN_MINUTES = 15
/** Whole days each side needs before the two are compared. */
export const SPLIT_MIN_DAYS = 3

// Logged activity that is not a training session. An unknown type counts as training: a new
// sport should not silently read as a rest day.
const NOT_TRAINING = /commut|yard|stretch|recovery|walk|golf|meditat|breath|sauna|massage|nap/i

export function isTrainingType(type: string | null | undefined): boolean {
  return !NOT_TRAINING.test(type ?? '')
}

export interface SplitWorkout {
  date: string
  workout_type?: string | null
  duration_min?: number | null
}

export interface SplitJournalDay {
  date: string
  food?: Partial<Record<MealSlot, string | null | undefined>> | null
  sodas?: DrinkLike[] | null
}

/** Minutes of training sessions per day. Pass workouts already merged across sources (mergeWorkouts). */
export function trainingMinutesByDay(workouts: readonly SplitWorkout[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const w of workouts) {
    if (!isTrainingType(w.workout_type) || typeof w.duration_min !== 'number' || !(w.duration_min > 0)) continue
    out.set(w.date, (out.get(w.date) ?? 0) + w.duration_min)
  }
  return out
}

export interface SplitGroup {
  days: number
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface TrainingSplit {
  training: SplitGroup | null
  rest: SplitGroup | null
  /** Both sides hold SPLIT_MIN_DAYS. */
  enough: boolean
  /** Training − rest, when `enough`. */
  diffKcal: number | null
  diffProtein: number | null
}

/**
 * The average whole-day intake on training days and on rest days, over the journal days given
 * (the caller passes its range). `today` keeps a day still under way out.
 */
export function trainingSplit(journal: readonly SplitJournalDay[], workouts: readonly SplitWorkout[], index: EstimateIndex, today: string): TrainingSplit {
  const minutes = trainingMinutesByDay(workouts)
  const sums = { training: { days: 0, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, rest: { days: 0, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } }
  for (const e of journal) {
    if (!isWholeDay(e) || !isDayDone(e, today)) continue
    const n = dayNutrition(e, index)
    if (!hasFullFigures(n)) continue
    const g = (minutes.get(e.date) ?? 0) >= TRAINING_MIN_MINUTES ? sums.training : sums.rest
    g.days++
    g.kcal += n.kcal
    g.protein_g += n.protein_g
    g.carbs_g += n.carbs_g
    g.fat_g += n.fat_g
  }
  const mean = (g: SplitGroup): SplitGroup | null => (g.days
    ? { days: g.days, kcal: Math.round(g.kcal / g.days), protein_g: Math.round(g.protein_g / g.days), carbs_g: Math.round(g.carbs_g / g.days), fat_g: Math.round(g.fat_g / g.days) }
    : null)
  const training = mean(sums.training)
  const rest = mean(sums.rest)
  const enough = (training?.days ?? 0) >= SPLIT_MIN_DAYS && (rest?.days ?? 0) >= SPLIT_MIN_DAYS
  return { training, rest, enough, diffKcal: enough ? training!.kcal - rest!.kcal : null, diffProtein: enough ? training!.protein_g - rest!.protein_g : null }
}
