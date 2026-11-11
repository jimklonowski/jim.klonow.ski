// Clinical calculators (audit #43 item 77): figures a clinician derives at the desk, computed
// here from the draw, the profile's date of birth and the protocol — none of them a plain
// function of one draw's markers, which is why they are not COMPUTED_MARKERS (those fold into
// every draw with no age and no schedule in hand).
//   - PSA adjusted for a 5-alpha-reductase inhibitor (×2 once on finasteride/dutasteride) and
//     PSA velocity between the last two comparable readings;
//   - FIB-4, the liver-fibrosis index from age, AST, ALT and platelets — the pre-oral-anabolic
//     liver check;
//   - eGFR from cystatin C (CKD-EPI 2012), the kidney figure creatine and muscle leave alone.
// Pure; tests/clinicalCalcs.test.mjs pins each formula.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { diffDays, roundTo } from './dates.ts'

/** Age in years (one decimal) on `date`, or null without a parseable birth date. */
export function ageOn(birthDate: string | null | undefined, date: string): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate > date) return null
  return roundTo(diffDays(birthDate, date) / 365.25, 1)
}

/** 5-ARIs roughly halve PSA once 6–12 months in: the on-treatment value is read doubled. */
export const FIVE_ARI_PSA_FACTOR = 2
export const FIVE_ARI = /finasteride|dutasteride/i
/** Before this many days on the drug the halving is incomplete, so the ×2 overstates. */
export const FIVE_ARI_SETTLE_DAYS = 180

/** PSA velocity is only read over at least this gap: two draws a month apart measure assay noise. */
export const PSA_VELOCITY_MIN_DAYS = 90
/** The conventional velocity that triggers urology follow-up, ng/mL per year. */
export const PSA_VELOCITY_WATCH = 0.75

export interface PsaReading {
  date: string
  value: number
  /** Taken on a 5-ARI: the stored value is doubled before any comparison. */
  onFiveAri: boolean
}

export function psaAdjusted(r: PsaReading): number {
  return r.onFiveAri ? roundTo(r.value * FIVE_ARI_PSA_FACTOR, 2) : r.value
}

/**
 * ng/mL per year between the two most recent readings at least PSA_VELOCITY_MIN_DAYS apart, on
 * the adjusted values, or null. `readings` in any order.
 */
export function psaVelocity(readings: readonly PsaReading[]): { perYear: number, from: PsaReading, to: PsaReading } | null {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date))
  const to = sorted.at(-1)
  if (!to) return null
  const from = [...sorted].reverse().find(r => diffDays(r.date, to.date) >= PSA_VELOCITY_MIN_DAYS)
  if (!from) return null
  const years = diffDays(from.date, to.date) / 365.25
  return { perYear: roundTo((psaAdjusted(to) - psaAdjusted(from)) / years, 2), from, to }
}

/** FIB-4 = (age × AST) / (platelets × √ALT); platelets in K/uL. */
export function fib4(age: number, ast: number, alt: number, platelets: number): number | null {
  if (!(age > 0) || !(ast > 0) || !(alt > 0) || !(platelets > 0)) return null
  return roundTo((age * ast) / (platelets * Math.sqrt(alt)), 2)
}

export type Fib4Band = 'low' | 'indeterminate' | 'high'

/** Under 1.3 rules advanced fibrosis out (2.0 from age 65), over 2.67 rules it in; between needs more. */
export function fib4Band(value: number, age: number): Fib4Band {
  const low = age >= 65 ? 2.0 : 1.3
  return value < low ? 'low' : value > 2.67 ? 'high' : 'indeterminate'
}

/** CKD-EPI 2012 cystatin C equation, mL/min/1.73 m². */
export function egfrCystatin(cystatinC: number, age: number, female = false): number | null {
  if (!(cystatinC > 0) || !(age > 0)) return null
  const ratio = cystatinC / 0.8
  const value = 133 * Math.min(ratio, 1) ** -0.499 * Math.max(ratio, 1) ** -1.328 * 0.996 ** age * (female ? 0.932 : 1)
  return roundTo(value, 0)
}

export interface ClinicalCalc {
  key: 'psa_adjusted' | 'psa_velocity' | 'fib4' | 'egfr_cystatin'
  label: string
  /** The figure as text, or null when an input is missing (then `missing` says which). */
  value: string | null
  unit: string
  /** One line: what it was computed from. */
  inputs: string
  /** One line: what the figure means, in the catalogue's terms. */
  reading: string
  tone: 'ok' | 'warn' | 'danger' | 'muted'
  missing?: string
}

/** A draw as the calculators read it. */
export interface CalcDraw {
  date: string
  markers: Record<string, number | null | undefined>
}

export interface CalcContext {
  /** YYYY-MM-DD from the profile, or null. */
  birthDate: string | null | undefined
  /** The day the 5-ARI span covering `date` began, or null when none was on the schedule that day. */
  fiveAriFrom: (date: string) => string | null
  female?: boolean
}

/** Days on the 5-ARI as of `date`, or null when not on one. */
function daysOnFiveAri(ctx: CalcContext, date: string): number | null {
  const from = ctx.fiveAriFrom(date)
  return from ? diffDays(from, date) : null
}

const fmt = (n: number) => Number(n.toFixed(2)).toString()

/**
 * Every calculator as of `draw` (the viewed one), reading earlier draws only for the PSA
 * velocity. A calculator with an input missing is still listed, saying what it needs.
 */
export function clinicalCalcs(draws: readonly CalcDraw[], draw: CalcDraw, ctx: CalcContext): ClinicalCalc[] {
  const age = ageOn(ctx.birthDate, draw.date)
  const m = draw.markers
  const out: ClinicalCalc[] = []

  // PSA
  if (m.psa != null) {
    const daysOn = daysOnFiveAri(ctx, draw.date)
    const on = daysOn != null
    const early = on && daysOn < FIVE_ARI_SETTLE_DAYS
    const adjusted = psaAdjusted({ date: draw.date, value: m.psa, onFiveAri: on })
    out.push({
      key: 'psa_adjusted',
      label: 'PSA, adjusted',
      value: fmt(adjusted),
      unit: 'ng/mL',
      inputs: on ? `${fmt(m.psa)} measured ${daysOn} days into a 5-ARI × ${FIVE_ARI_PSA_FACTOR}` : `${fmt(m.psa)} measured, no 5-ARI on the schedule that day`,
      reading: `${adjusted > 4 ? 'over 4.0 — the conventional urology referral line' : adjusted > 2.5 ? 'above 2.5 — worth a velocity read and a repeat' : 'under 2.5'}${early ? `; under ${FIVE_ARI_SETTLE_DAYS} days on the drug the halving is incomplete, so the ×2 overstates` : ''}`,
      tone: adjusted > 4 ? 'danger' : adjusted > 2.5 ? 'warn' : 'ok'
    })
    const series = draws.filter(d => d.markers.psa != null && d.date <= draw.date).map(d => ({ date: d.date, value: d.markers.psa!, onFiveAri: ctx.fiveAriFrom(d.date) != null }))
    const v = psaVelocity(series)
    if (v) {
      // Across the drug's start, or with the later reading still early on it, the two are not
      // comparable: the figure is shown but read as unsettled, never as a follow-up trigger.
      const straddles = v.from.onFiveAri !== v.to.onFiveAri
      const toEarly = v.to.onFiveAri && (daysOnFiveAri(ctx, v.to.date) ?? Infinity) < FIVE_ARI_SETTLE_DAYS
      const unsettled = straddles || toEarly
      out.push({
        key: 'psa_velocity',
        label: 'PSA velocity',
        value: `${v.perYear > 0 ? '+' : ''}${fmt(v.perYear)}`,
        unit: 'ng/mL/yr',
        inputs: `${fmt(psaAdjusted(v.from))} (${v.from.date}${v.from.onFiveAri ? ', ×2' : ''}) → ${fmt(psaAdjusted(v.to))} (${v.to.date}${v.to.onFiveAri ? ', ×2' : ''})`,
        reading: unsettled
          ? `${straddles ? 'the pair straddles the 5-ARI start' : 'the later reading is early on the 5-ARI'} — the ×2 is not yet exact, so this is not a follow-up trigger; read the velocity again once two on-treatment readings are ${FIVE_ARI_SETTLE_DAYS}+ days in`
          : v.perYear > PSA_VELOCITY_WATCH ? `over ${PSA_VELOCITY_WATCH} ng/mL/yr — the rise that warrants follow-up` : `under the ${PSA_VELOCITY_WATCH} ng/mL/yr watch line`,
        tone: unsettled ? 'muted' : v.perYear > PSA_VELOCITY_WATCH ? 'warn' : 'ok'
      })
    }
    else {
      out.push({ key: 'psa_velocity', label: 'PSA velocity', value: null, unit: 'ng/mL/yr', inputs: '', reading: '', tone: 'muted', missing: `needs two PSA readings at least ${PSA_VELOCITY_MIN_DAYS} days apart` })
    }
  }

  // FIB-4
  if (m.ast != null || m.alt != null || m.platelets != null) {
    const have = m.ast != null && m.alt != null && m.platelets != null
    const value = have && age != null ? fib4(age, m.ast!, m.alt!, m.platelets!) : null
    const band = value != null && age != null ? fib4Band(value, age) : null
    out.push(value != null && band
      ? {
          key: 'fib4',
          label: 'FIB-4',
          value: fmt(value),
          unit: '',
          inputs: `age ${age} × AST ${m.ast} / (platelets ${m.platelets} × √ALT ${m.alt})`,
          reading: band === 'low' ? 'under 1.3 — advanced fibrosis unlikely; the liver baseline an oral anabolic wants' : band === 'high' ? 'over 2.67 — advanced fibrosis likely; imaging before any oral anabolic' : 'indeterminate (1.3–2.67) — not a clean baseline; elastography settles it',
          tone: band === 'low' ? 'ok' : band === 'high' ? 'danger' : 'warn'
        }
      : { key: 'fib4', label: 'FIB-4', value: null, unit: '', inputs: '', reading: '', tone: 'muted', missing: age == null ? 'needs the date of birth on the profile' : `needs AST, ALT and platelets on one draw (missing ${['ast', 'alt', 'platelets'].filter(k => m[k] == null).join(', ')})` })
  }

  // eGFR from cystatin C
  if (m.cystatin_c != null) {
    const value = age != null ? egfrCystatin(m.cystatin_c, age, ctx.female) : null
    out.push(value != null
      ? {
          key: 'egfr_cystatin',
          label: 'eGFR (cystatin C)',
          value: fmt(value),
          unit: 'mL/min/1.73m²',
          inputs: `cystatin C ${m.cystatin_c} mg/L, age ${age}, CKD-EPI 2012${m.egfr != null ? ` · creatinine eGFR read ${m.egfr}` : ''}`,
          reading: value >= 90 ? 'normal filtration — a creatinine eGFR below this is muscle and creatine, not kidney' : value >= 60 ? 'mildly reduced (60–89)' : 'under 60 — chronic kidney disease range if sustained',
          tone: value >= 90 ? 'ok' : value >= 60 ? 'warn' : 'danger'
        }
      : { key: 'egfr_cystatin', label: 'eGFR (cystatin C)', value: null, unit: 'mL/min/1.73m²', inputs: '', reading: '', tone: 'muted', missing: 'needs the date of birth on the profile' })
  }

  return out
}
