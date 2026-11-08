// The Health Auto Export payload → per-date vitals (journal_entries) and health metrics
// (health_metrics). Pure, so tests/healthExport.test.mjs can feed it real-shaped points; the
// webhook (server/api/journal/health-webhook.post.ts) writes what comes out.
//
// A metric arrives as { name, units, data: [{ date, qty | value, … }] }. Health Auto Export
// aggregates per its export interval — a daily export gives one point per day, an hourly one
// several — so the counts and energies (steps, kcal, water) are SUMMED over a date's points,
// while readings (weight, rates, saturation, waist) keep the day's last, and sleep keeps the
// day's longest session (sleepSession below). Units follow the phone's settings, so each branch
// converts what it might be sent.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import type { Vitals } from './vitalsUpsert.ts'

export interface HealthExportMetric {
  name: string
  units?: string
  data: Array<Record<string, unknown>>
}

/** What the webhook writes to health_metrics for one date (migration 0015 fields included). */
export interface HealthMetricsIn {
  vo2_max?: number
  body_fat_pct?: number
  lean_body_mass_lbs?: number
  sleep_total_min?: number
  sleep_rem_min?: number
  sleep_deep_min?: number
  sleep_core_min?: number
  sleep_awake_min?: number
  steps?: number
  active_kcal?: number
  basal_kcal?: number
  resp_rate?: number
  spo2_pct?: number
  waist_in?: number
  dietary_water_oz?: number
  sleep_start?: string
  sleep_end?: string
}

export interface ParsedHealthExport {
  byDate: Record<string, Vitals>
  healthByDate: Record<string, HealthMetricsIn>
}

const LBS_PER_KG = 2.20462
const IN_PER_CM = 1 / 2.54
const OZ_PER_ML = 1 / 29.5735
const KCAL_PER_KJ = 1 / 4.184

const round1 = (n: number) => Math.round(n * 10) / 10
const hoursToMin = (qty: number) => Math.round(qty * 60)
const isKg = (units?: string) => /^kg$/i.test(units ?? '')
const isCm = (units?: string) => /^cm$/i.test(units ?? '')
const isKj = (units?: string) => /^kj$/i.test(units ?? '')
/** mL/L → oz; "fl_oz", "fl oz", "oz" (and anything unknown) are taken as ounces. */
function toOz(qty: number, units?: string): number {
  const u = (units ?? '').toLowerCase()
  if (u === 'ml' || u === 'milliliter' || u === 'milliliters') return qty * OZ_PER_ML
  if (u === 'l' || u === 'liter' || u === 'liters') return qty * 1000 * OZ_PER_ML
  return qty
}

/** The point's reading: Health Auto Export has used both `qty` and `value`. */
function qtyOf(point: Record<string, unknown>): number | null {
  if (typeof point.qty === 'number') return point.qty
  if (typeof point.value === 'number') return point.value
  return null
}

const stamp = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

interface SleepSession {
  /** Minutes asleep; the stages' sum when there are any, else Health Auto Export's own total. */
  total: number
  /** Whether rem/deep/core carried the total (an Apple Watch night) or only the total did (Whoop's). */
  staged: boolean
  rem: number
  deep: number
  core: number
  awake?: number
  start?: string
  end?: string
}

/**
 * One sleep_analysis point as a session, or null when there is no sleep in it. Time asleep is the
 * stages' sum — HealthKit's own definition (rem + core + deep) — because Health Auto Export's own
 * `asleep` has read 0 beside correct stages. The reverse happens too: Whoop writes a night to
 * HealthKit as one unstaged "asleep" sample, so the stages read 0 beside a correct `asleep`
 * (2026-11-07, Apple Watch on the charger). The stages win when they hold anything; otherwise the
 * export's total (`asleep`, or the newer `totalSleep`) is the night.
 */
function sleepSession(point: Record<string, unknown>): SleepSession | null {
  const minutes = (v: unknown) => (typeof v === 'number' && v > 0 ? hoursToMin(v) : 0)
  const rem = minutes(point.rem)
  const deep = minutes(point.deep)
  const core = minutes(point.core)
  const staged = rem + deep + core > 0
  const total = staged ? rem + deep + core : Math.max(minutes(point.asleep), minutes(point.totalSleep))
  if (total <= 0) return null
  return {
    total,
    staged,
    rem,
    deep,
    core,
    awake: typeof point.awake === 'number' ? hoursToMin(point.awake) : undefined,
    start: stamp(point.sleepStart),
    end: stamp(point.sleepEnd)
  }
}

export function parseHealthExport(metrics: HealthExportMetric[]): ParsedHealthExport {
  const byDate: Record<string, Vitals> = {}
  const healthByDate: Record<string, HealthMetricsIn> = {}
  /** Minutes asleep in the session chosen for each date so far (the longest wins). */
  const sleepChosen: Record<string, number> = {}

  for (const metric of metrics) {
    const { name, units, data } = metric
    for (const point of data ?? []) {
      const dateStr = String(point.date ?? '').substring(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue
      // A date bucket for every well-formed point, recognized metric or not: the webhook only
      // writes buckets with something in them, so an unknown metric never makes a blank row.
      const v = (byDate[dateStr] ??= {})
      const h = (healthByDate[dateStr] ??= {})
      const qty = qtyOf(point)
      /** Counts and energies accumulate over a date's points. */
      const add = (field: 'steps' | 'active_kcal' | 'basal_kcal' | 'dietary_water_oz', amount: number) => {
        h[field] = (h[field] ?? 0) + amount
      }

      switch (name) {
        // --- vitals, into the journal row ---
        case 'body_mass':
          if (qty != null) v.weight_lbs = round1(isKg(units) ? qty * LBS_PER_KG : qty)
          break
        case 'resting_heart_rate':
          if (qty != null) v.rhr = Math.round(qty)
          break
        case 'heart_rate_variability':
          if (qty != null) v.hrv = Math.round(qty)
          break
        case 'blood_pressure':
          if (typeof point.systolic === 'number') v.bp_systolic = Math.round(point.systolic)
          if (typeof point.diastolic === 'number') v.bp_diastolic = Math.round(point.diastolic)
          break
        case 'blood_pressure_systolic':
          if (qty != null) v.bp_systolic = Math.round(qty)
          break
        case 'blood_pressure_diastolic':
          if (qty != null) v.bp_diastolic = Math.round(qty)
          break

        // --- health metrics ---
        case 'vo2_max':
          if (qty != null) h.vo2_max = round1(qty)
          break
        case 'body_fat_percentage':
          // A fraction (0.225) or already a percentage (22.5), depending on the export version.
          if (qty != null) h.body_fat_pct = qty <= 1 ? Math.round(qty * 1000) / 10 : round1(qty)
          break
        case 'lean_body_mass':
          if (qty != null) h.lean_body_mass_lbs = round1(isKg(units) ? qty * LBS_PER_KG : qty)
          break
        case 'sleep_analysis': {
          const night = sleepSession(point)
          // The day's LONGEST session wins, not its last: Whoop writes naps to HealthKit as their
          // own sessions, and on 2026-11-07 a 76-minute nap arrived after the night and replaced
          // it (0 minutes of stages, the nap's start/end). A session with no sleep in it writes
          // nothing, so a stageless point can't zero a night already on the row.
          if (!night || night.total <= (sleepChosen[dateStr] ?? 0)) break
          sleepChosen[dateStr] = night.total
          h.sleep_total_min = night.total
          // Stage minutes only when the stages carried the night — a fallback total beside
          // three zero stages would chart as a night with no deep or REM sleep.
          if (night.staged) {
            h.sleep_rem_min = night.rem
            h.sleep_deep_min = night.deep
            h.sleep_core_min = night.core
          }
          else {
            delete h.sleep_rem_min
            delete h.sleep_deep_min
            delete h.sleep_core_min
          }
          if (night.awake != null) h.sleep_awake_min = night.awake
          else delete h.sleep_awake_min
          // When the night began and ended, as printed; bedtime regularity reads these later.
          if (night.start) h.sleep_start = night.start
          else delete h.sleep_start
          if (night.end) h.sleep_end = night.end
          else delete h.sleep_end
          break
        }

        // --- the Apple metrics that used to be dropped (audit #43 item 56) ---
        case 'step_count':
        case 'steps':
          if (qty != null) add('steps', Math.round(qty))
          break
        case 'active_energy':
        case 'active_energy_burned':
          if (qty != null) add('active_kcal', isKj(units) ? qty * KCAL_PER_KJ : qty)
          break
        case 'basal_energy_burned':
        case 'basal_energy':
          if (qty != null) add('basal_kcal', isKj(units) ? qty * KCAL_PER_KJ : qty)
          break
        case 'respiratory_rate':
          if (qty != null) h.resp_rate = round1(qty)
          break
        case 'blood_oxygen_saturation':
        case 'oxygen_saturation':
          if (qty != null) h.spo2_pct = qty <= 1 ? Math.round(qty * 1000) / 10 : round1(qty)
          break
        case 'waist_circumference':
          if (qty != null) h.waist_in = round1(isCm(units) ? qty * IN_PER_CM : qty)
          break
        case 'dietary_water':
          if (qty != null) add('dietary_water_oz', toOz(qty, units))
          break
      }
    }
  }

  // The accumulated energies and water to a tenth, once, after every point is in.
  for (const h of Object.values(healthByDate)) {
    if (h.active_kcal != null) h.active_kcal = round1(h.active_kcal)
    if (h.basal_kcal != null) h.basal_kcal = round1(h.basal_kcal)
    if (h.dietary_water_oz != null) h.dietary_water_oz = round1(h.dietary_water_oz)
  }
  return { byDate, healthByDate }
}
