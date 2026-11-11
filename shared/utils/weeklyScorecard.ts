// The weekly scorecard (audit #43 item 79): the week's numbers as a fixed table above the
// weekly digest's prose — the same arithmetic every week, computed from the record for the
// digest's own period, so a past week reads as it was and nothing here is written by a model.
// Each row is a figure, what it is measured against, and a tone; a row with nothing to say is
// left out. Pure; tests/weeklyScorecard.test.mjs pins the rows.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { diffDays, eachDay, shiftDays } from './dates.ts'
import { drinkTotals, hydrationOz, lateCaffeineMg, sodasOnly, type DrinkLike } from './drinks.ts'
import { dexaCalibration, energyBalance, type ScanMass } from './energyBalance.ts'
import { dayNutrition, hasFullFigures, isWholeDay, type EstimateIndex, type MealSlot } from './nutrition.ts'
import { sodaTotals } from './soda.ts'
import { weighInsOf, weightTrend } from './weightTrend.ts'

export interface ScoreJournalDay {
  date: string
  weight_lbs?: number | null
  food?: Partial<Record<MealSlot, string | null | undefined>> | null
  sodas?: DrinkLike[] | null
  water?: Array<{ oz?: number | null }> | null
}
export interface ScoreHealthDay {
  date: string
  steps?: number | null
  sleep_total_min?: number | null
  sleep_start?: string | null
  recovery_score?: number | null
}
export interface ScoreWorkout {
  date: string
  duration_min?: number | null
}

export interface ScorecardInputs {
  start: string
  end: string
  journal: readonly ScoreJournalDay[]
  health: readonly ScoreHealthDay[]
  workouts: readonly ScoreWorkout[]
  estimates: EstimateIndex
  scans: readonly ScanMass[]
  /** Grams a day (shared/utils/proteinTarget.ts), or null. */
  proteinTarget: number | null
  waterGoalOz: number | null
}

export type ScoreTone = 'ok' | 'warn' | 'muted'

export interface ScoreRow {
  key: 'weight' | 'intake' | 'protein' | 'training' | 'steps' | 'sleep' | 'soda' | 'caffeine' | 'water'
  label: string
  /** The figure: "170.2 lb". */
  value: string
  /** What it is read against: "−0.6 lb on the week · −0.4 lb/wk over 14 d". */
  detail: string
  tone: ScoreTone
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const signed = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`
const hm = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`

/** Minutes after noon a night began, from "2026-10-21 23:12:00 -0500" or an ISO stamp read as printed; null when unreadable. */
export function bedtimeMinutes(stamp: string | null | undefined): number | null {
  const m = /[T ](\d{2}):(\d{2})/.exec(stamp ?? '')
  if (!m) return null
  const mins = Number(m[1]) * 60 + Number(m[2])
  // Noon-anchored so 23:30 and 00:30 sit an hour apart, not 23 hours.
  return (mins + 12 * 60) % (24 * 60)
}

const stdev = (xs: number[]) => {
  const mu = mean(xs)
  return Math.sqrt(mean(xs.map(x => (x - mu) ** 2)))
}

/** The week's rows, in reading order. */
export function weeklyScorecard(i: ScorecardInputs): ScoreRow[] {
  const days = eachDay(i.start, i.end)
  const inWeek = <T extends { date: string }>(rows: readonly T[]) => rows.filter(r => r.date >= i.start && r.date <= i.end)
  const journal = inWeek(i.journal)
  const health = inWeek(i.health)
  const rows: ScoreRow[] = []

  // --- weight: the trend at the week's end against the day before it began ---
  const weighIns = weighInsOf([...i.journal])
  const now = weightTrend(weighIns, i.end)
  const before = weightTrend(weighIns, shiftDays(i.start, -1))
  if (now.trend != null) {
    const delta = before.trend != null ? Number((now.trend - before.trend).toFixed(1)) : null
    rows.push({
      key: 'weight',
      label: 'Weight trend',
      value: `${now.trend} lb`,
      detail: [delta != null ? `${signed(delta)} lb on the week` : 'no trend the week before', now.ratePerWeek != null ? `${signed(now.ratePerWeek)} lb/wk over 14 d` : ''].filter(Boolean).join(' · '),
      tone: 'muted'
    })
  }

  // --- intake against expenditure, protein against target: whole days with every meal figured ---
  const whole = journal.flatMap((e) => {
    const n = dayNutrition(e, i.estimates)
    return hasFullFigures(n) && isWholeDay(e) ? [n] : []
  })
  if (whole.length) {
    const kcal = Math.round(mean(whole.map(n => n.kcal)))
    const intake = [...i.journal].flatMap((e) => {
      const n = dayNutrition(e, i.estimates)
      return hasFullFigures(n) && isWholeDay(e) ? [{ date: e.date, kcal: n.kcal }] : []
    })
    const balance = energyBalance(intake, weightTrend(weighIns, i.end).points, dexaCalibration(i.scans), i.end)
    const maintenance = balance.maintenanceKcal
    rows.push({
      key: 'intake',
      label: 'Intake',
      value: `${kcal.toLocaleString('en-US')} kcal/day`,
      detail: `${whole.length} of ${days.length} days logged whole${maintenance != null ? ` · maintenance ≈ ${maintenance.toLocaleString('en-US')} (${balance.windowDays} d) → ${signed(kcal - maintenance, 0)}/day` : ' · no maintenance figure yet'}`,
      tone: 'muted'
    })
    const protein = Math.round(mean(whole.map(n => n.protein_g)))
    rows.push({
      key: 'protein',
      label: 'Protein',
      value: `${protein} g/day`,
      detail: i.proteinTarget ? `target ${i.proteinTarget} g · ${whole.filter(n => n.protein_g >= i.proteinTarget!).length} of ${whole.length} days met` : 'no target set',
      tone: i.proteinTarget ? (protein >= i.proteinTarget ? 'ok' : 'warn') : 'muted'
    })
  }

  // --- training ---
  const sessions = inWeek(i.workouts)
  const minutes = Math.round(sessions.reduce((s, w) => s + (w.duration_min ?? 0), 0))
  const activeDays = new Set(sessions.map(w => w.date)).size
  rows.push({
    key: 'training',
    label: 'Training',
    value: `${sessions.length} session${sessions.length === 1 ? '' : 's'}`,
    detail: sessions.length ? `${minutes} min across ${activeDays} day${activeDays === 1 ? '' : 's'}` : 'none logged',
    tone: sessions.length ? 'ok' : 'warn'
  })

  // --- steps ---
  const steps = health.map(h => h.steps).filter((v): v is number => typeof v === 'number' && v > 0)
  if (steps.length) {
    rows.push({ key: 'steps', label: 'Steps', value: `${Math.round(mean(steps)).toLocaleString('en-US')}/day`, detail: `${steps.length} day${steps.length === 1 ? '' : 's'} counted · low ${Math.min(...steps).toLocaleString('en-US')}, high ${Math.max(...steps).toLocaleString('en-US')}`, tone: 'muted' })
  }

  // --- sleep: the average, and how much the bedtime moved ---
  const nights = health.filter(h => typeof h.sleep_total_min === 'number' && h.sleep_total_min > 0)
  if (nights.length) {
    const avg = mean(nights.map(h => h.sleep_total_min!))
    const beds = nights.map(h => bedtimeMinutes(h.sleep_start)).filter((v): v is number => v != null)
    const spread = beds.length >= 3 ? Math.round(stdev(beds)) : null
    rows.push({
      key: 'sleep',
      label: 'Sleep',
      value: `${hm(avg)}/night`,
      detail: `${nights.length} night${nights.length === 1 ? '' : 's'}${spread != null ? ` · bedtime ±${spread} min` : ''}`,
      // Under seven hours, or a bedtime wandering by more than an hour, is the thing to fix first.
      tone: avg < 420 || (spread != null && spread > 60) ? 'warn' : 'ok'
    })
  }

  // --- soda, caffeine, water ---
  const sodas = journal.flatMap(e => sodasOnly(e.sodas))
  const st = sodaTotals(sodas)
  rows.push({
    key: 'soda',
    label: 'Soda',
    value: `${st.count}`,
    detail: st.count ? `${st.oz ? `~${st.oz} oz · ` : ''}${new Set(journal.filter(e => sodasOnly(e.sodas).length).map(e => e.date)).size} of ${days.length} days` : 'a clean week',
    tone: st.count ? 'warn' : 'ok'
  })
  const cafDays = journal.map(e => ({ mg: drinkTotals(e.sodas).caffeine_mg, late: lateCaffeineMg(e.sodas) })).filter(d => d.mg > 0)
  if (cafDays.length) {
    const lateDays = cafDays.filter(d => d.late > 0).length
    rows.push({
      key: 'caffeine',
      label: 'Caffeine',
      value: `${Math.round(mean(cafDays.map(d => d.mg)))} mg/day`,
      detail: `${cafDays.length} day${cafDays.length === 1 ? '' : 's'} with any${lateDays ? ` · after 14:00 on ${lateDays}` : ' · none after 14:00'}`,
      tone: lateDays ? 'warn' : 'muted'
    })
  }
  const wet = journal.map(e => hydrationOz(e)).filter(oz => oz > 0)
  if (wet.length) {
    const avg = Math.round(mean(wet))
    rows.push({
      key: 'water',
      label: 'Water',
      value: `${avg} oz/day`,
      detail: `${wet.length} of ${days.length} days logged${i.waterGoalOz ? ` · goal ${i.waterGoalOz} oz, met on ${wet.filter(oz => oz >= i.waterGoalOz!).length}` : ''}`,
      tone: i.waterGoalOz ? (avg >= i.waterGoalOz ? 'ok' : 'warn') : 'muted'
    })
  }

  return rows
}

/** The week's length in days, for a caption. */
export function scorecardDays(start: string, end: string): number {
  return diffDays(start, end) + 1
}
