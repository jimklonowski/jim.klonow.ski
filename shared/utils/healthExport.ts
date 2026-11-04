// The Health Auto Export payload → per-date vitals (journal_entries) and health metrics
// (health_metrics). Pure, so tests/healthExport.test.mjs can feed it real-shaped points; the
// webhook (server/api/journal/health-webhook.post.ts) writes what comes out.
//
// A metric arrives as { name, units, data: [{ date, qty | value, … }] }. Health Auto Export
// aggregates per its export interval — a daily export gives one point per day, an hourly one
// several — so the counts and energies (steps, kcal, water) are SUMMED over a date's points,
// while readings (weight, rates, saturation, waist) keep the day's last. Units follow the
// phone's settings, so each branch converts what it might be sent.
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

export function parseHealthExport(metrics: HealthExportMetric[]): ParsedHealthExport {
  const byDate: Record<string, Vitals> = {}
  const healthByDate: Record<string, HealthMetricsIn> = {}

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
        case 'sleep_analysis':
          if (typeof point.rem === 'number') h.sleep_rem_min = hoursToMin(point.rem)
          if (typeof point.deep === 'number') h.sleep_deep_min = hoursToMin(point.deep)
          if (typeof point.core === 'number') h.sleep_core_min = hoursToMin(point.core)
          if (typeof point.awake === 'number') h.sleep_awake_min = hoursToMin(point.awake)
          // Health Auto Export's own `asleep` has read 0 beside correct stages, so total time
          // asleep is the stages' sum — HealthKit's own definition (rem + core + deep).
          if (h.sleep_rem_min != null || h.sleep_deep_min != null || h.sleep_core_min != null) {
            h.sleep_total_min = (h.sleep_rem_min ?? 0) + (h.sleep_deep_min ?? 0) + (h.sleep_core_min ?? 0)
          }
          // When the night began and ended, as printed; bedtime regularity reads these later.
          if (stamp(point.sleepStart)) h.sleep_start = stamp(point.sleepStart)
          if (stamp(point.sleepEnd)) h.sleep_end = stamp(point.sleepEnd)
          break

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
