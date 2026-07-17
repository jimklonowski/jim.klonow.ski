import { convertUnit, type MixUnit } from './peptideCalc'
import { getCompoundInfo } from '~/data/compoundInfo'
import type { JournalEntry, Vial } from '~/data/journal'

// How far back to look when estimating a compound's daily consumption rate, and the minimum
// number of distinct dosing days needed before we trust logged history over the typical-dose
// fallback from compoundInfo.
const RATE_WINDOW_DAYS = 28
const MIN_HISTORY_DOSE_DAYS = 3

export type RateBasis = 'history' | 'typical' | null

export interface VialProjection {
  /** Amount drawn from this vial since it was opened, in the vial's unit. */
  used: number
  /** Amount still in the vial, in the vial's unit (clamped at 0). */
  remaining: number
  /** Fraction remaining, 0–1. */
  pct: number
  /** Estimated consumption in the vial's unit per day, or null if not estimable. */
  dailyAmount: number | null
  /** Where dailyAmount came from: logged 'history', compoundInfo 'typical', or null. */
  basis: RateBasis
  /** Projected days until empty, or null if no rate. */
  daysLeft: number | null
  /** Projected run-out date (YYYY-MM-DD), or null. */
  runOutDate: string | null
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()
  return Math.round(ms / 86400000)
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function roundAmount(n: number): number {
  return Math.round(n * 1000) / 1000
}

// Sum of doses of this vial's compound logged on/after its opened_date, expressed in the vial's
// unit. Doses in an incompatible unit (e.g. IU against an mg vial) are skipped.
export function computeUsedAmount(vial: Vial, entries: JournalEntry[]): number {
  if (!vial.opened_date) return 0
  const vialUnit = vial.vial_unit as MixUnit
  let total = 0
  for (const e of entries) {
    if (e.date < vial.opened_date) continue
    for (const p of e.peptides ?? []) {
      if (p.compound !== vial.compound) continue
      const converted = convertUnit(p.dose, p.unit as MixUnit, vialUnit)
      if (converted != null) total += converted
    }
  }
  return total
}

export function computeRemaining(vial: Vial, entries: JournalEntry[]) {
  const used = computeUsedAmount(vial, entries)
  const remaining = Math.max(0, vial.vial_amount - used)
  const pct = vial.vial_amount > 0 ? remaining / vial.vial_amount : 0
  return { used, remaining, pct }
}

// Best-effort per-day dose from compoundInfo when there isn't enough logged history.
// Parses the typical dose range (midpoint) and frequency into an amount in `targetUnit`.
function typicalDailyAmount(compound: string, targetUnit: MixUnit): number | null {
  const info = getCompoundInfo(compound)
  if (!info) return null

  const m = info.dosing.range.match(/([\d.]+)(?:\s*[–—-]\s*([\d.]+))?\s*(mg|mcg|iu)/i)
  if (!m) return null
  const lo = parseFloat(m[1]!)
  const hi = m[2] ? parseFloat(m[2]) : lo
  const mid = (lo + hi) / 2
  const unit = m[3]!.toLowerCase() as MixUnit

  const perDose = convertUnit(mid, unit, targetUnit)
  if (perDose == null) return null
  return perDose * parseFrequencyPerDay(info.dosing.frequency)
}

// Rough doses-per-day from a free-text frequency string ("1–2x daily", "2x weekly", etc.).
function parseFrequencyPerDay(frequency: string): number {
  const f = frequency.toLowerCase()
  if (f.includes('every other day') || f.includes('eod')) return 0.5

  let mult = 1
  const mx = f.match(/(\d+)\s*x/)
  if (mx) mult = parseInt(mx[1]!)
  else if (f.includes('twice')) mult = 2

  if (f.includes('week')) return mult / 7
  return mult // treat daily / unspecified as per-day
}

export function estimateDailyRate(
  vial: Vial,
  entries: JournalEntry[],
  today: string
): { dailyAmount: number | null, basis: RateBasis } {
  const vialUnit = vial.vial_unit as MixUnit
  const windowStart = addDays(today, -RATE_WINDOW_DAYS)

  const inWindow: { date: string, amount: number }[] = []
  for (const e of entries) {
    if (e.date < windowStart || e.date > today) continue
    for (const p of e.peptides ?? []) {
      if (p.compound !== vial.compound) continue
      const converted = convertUnit(p.dose, p.unit as MixUnit, vialUnit)
      if (converted != null) inWindow.push({ date: e.date, amount: converted })
    }
  }

  const doseDates = [...new Set(inWindow.map(d => d.date))].sort()
  if (doseDates.length >= MIN_HISTORY_DOSE_DAYS) {
    const total = inWindow.reduce((s, d) => s + d.amount, 0)
    const span = Math.max(1, daysBetween(doseDates[0]!, today) + 1)
    return { dailyAmount: total / span, basis: 'history' }
  }

  const typical = typicalDailyAmount(vial.compound, vialUnit)
  if (typical != null && typical > 0) return { dailyAmount: typical, basis: 'typical' }
  return { dailyAmount: null, basis: null }
}

export function projectVial(vial: Vial, entries: JournalEntry[], today: string): VialProjection {
  const { used, remaining, pct } = computeRemaining(vial, entries)
  const { dailyAmount, basis } = estimateDailyRate(vial, entries, today)

  let daysLeft: number | null = null
  let runOutDate: string | null = null
  if (dailyAmount && dailyAmount > 0) {
    daysLeft = remaining / dailyAmount
    runOutDate = addDays(today, Math.max(0, Math.ceil(daysLeft)))
  }

  return { used, remaining, pct, dailyAmount, basis, daysLeft, runOutDate }
}

export function isExpiringSoon(expiry: string | null | undefined, today: string, withinDays = 30): boolean {
  if (!expiry) return false
  const d = daysBetween(today, expiry)
  return d >= 0 && d <= withinDays
}

export function isExpired(expiry: string | null | undefined, today: string): boolean {
  if (!expiry) return false
  return daysBetween(today, expiry) < 0
}
