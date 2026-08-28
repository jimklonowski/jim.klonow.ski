// Estimated-exposure modeling for the slow-release injectables. Each logged dose contributes
// a Bateman curve — first-order release out of the oil/subq depot, first-order elimination
// once in circulation — and doses superpose. Everything here is RELATIVE: the per-dose shape
// is normalized so a single dose peaks at its logged amount, which makes the units
// "dose-equivalents", not serum concentrations. Callers present levels as % of a recent peak.
//
// Shared (app + server) because the exposure charts on the compound pages and the AI lab
// summary's draw-timing lines must agree on the same model.

export interface PkModel {
  /** Depot-release half-life in days — the slow, rate-limiting phase for oil esters. */
  absorptionHalfLifeDays: number
  /** Elimination half-life in days once in circulation. */
  eliminationHalfLifeDays: number
}

export interface PkDose {
  date: string
  /** HH:MM if logged; a morning dose is assumed otherwise. */
  time?: string | null
  amount: number
}

// Typical literature half-lives for the ester/peptide, not personal measurements — good
// enough for relative peak/trough shape, useless for absolute levels. Compounds cleared in
// hours (HGH, most peptides, orals) are deliberately absent: at daily dosing their curve is
// a comb of spikes that says nothing the dose log doesn't. For hCG the fast phase is
// absorption and the slow one elimination (subq peptide, ~33h); for the esters it's the
// reverse (depot release limits) — the Bateman shape doesn't care which is which.
export const PK_MODELS: Record<string, PkModel> = {
  'Testosterone Cypionate': { absorptionHalfLifeDays: 8, eliminationHalfLifeDays: 1 },
  'Testosterone Enanthate': { absorptionHalfLifeDays: 7, eliminationHalfLifeDays: 1 },
  'Testosterone Propionate': { absorptionHalfLifeDays: 2, eliminationHalfLifeDays: 0.35 },
  'Sustanon 250': { absorptionHalfLifeDays: 9, eliminationHalfLifeDays: 1 },
  'Methenolone Enanthate': { absorptionHalfLifeDays: 10, eliminationHalfLifeDays: 1 },
  'Nandrolone Decanoate': { absorptionHalfLifeDays: 12, eliminationHalfLifeDays: 1 },
  'hCG': { absorptionHalfLifeDays: 0.3, eliminationHalfLifeDays: 1.4 }
}

const LN2 = Math.log(2)
const MS_PER_HOUR = 3_600_000

/** Hours since epoch for a dose. Parsed without a zone marker, so diffs stay consistent
 * whether this runs in the browser (local time) or on a Worker (UTC). */
function doseHours(d: PkDose): number {
  const time = d.time && /^\d{2}:\d{2}$/.test(d.time) ? d.time : '08:00'
  return Date.parse(`${d.date}T${time}:00`) / MS_PER_HOUR
}

interface Rates {
  ka: number
  ke: number
  /** Peak of the unnormalized shape, so contributions can be scaled to peak = amount. */
  peak: number
  /** Past ~8 slow-phase half-lives a dose adds <0.4% of its peak — skip it. */
  cutoffH: number
}

function ratesOf(model: PkModel): Rates {
  const ka = LN2 / (model.absorptionHalfLifeDays * 24)
  let ke = LN2 / (model.eliminationHalfLifeDays * 24)
  // Equal rates degenerate the Bateman difference to zero; a nudge keeps the closed form.
  if (ke === ka) ke *= 1.0001
  const tmax = Math.log(ka / ke) / (ka - ke)
  const peak = Math.abs(Math.exp(-ka * tmax) - Math.exp(-ke * tmax))
  const cutoffH = 8 * 24 * Math.max(model.absorptionHalfLifeDays, model.eliminationHalfLifeDays)
  return { ka, ke, peak, cutoffH }
}

/** Hours from injection to modeled peak for a single dose. */
export function peakHours(model: PkModel): number {
  const { ka, ke } = ratesOf(model)
  return Math.log(ka / ke) / (ka - ke)
}

/** Modeled level at an absolute hour (superposed doses), in dose-equivalents. */
export function exposureAt(doses: PkDose[], model: PkModel, atHours: number): number {
  const r = ratesOf(model)
  let sum = 0
  for (const d of doses) {
    const h = atHours - doseHours(d)
    if (h < 0 || h > r.cutoffH) continue
    sum += d.amount * (Math.abs(Math.exp(-r.ka * h) - Math.exp(-r.ke * h)) / r.peak)
  }
  return sum
}

export interface ExposurePoint {
  date: string
  level: number
}

/** Daily samples (noon) of the modeled level across [from, to] inclusive. Doses outside the
 * window still contribute their tails, so pass the full dose history, not a windowed slice. */
export function exposureSeries(doses: PkDose[], model: PkModel, from: string, to: string): ExposurePoint[] {
  const r = ratesOf(model)
  const at = doses.map(d => ({ h: doseHours(d), amount: d.amount }))
  const out: ExposurePoint[] = []
  const cur = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  while (cur <= end) {
    const hNow = cur.getTime() / MS_PER_HOUR
    let sum = 0
    for (const d of at) {
      const h = hNow - d.h
      if (h < 0 || h > r.cutoffH) continue
      sum += d.amount * (Math.abs(Math.exp(-r.ka * h) - Math.exp(-r.ke * h)) / r.peak)
    }
    out.push({ date: cur.toLocaleDateString('en-CA'), level: sum })
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

// How far back the "recent peak" reference for a draw looks. Two weeks: several dosing cycles
// for every modeled compound (all dose at least weekly), yet short enough that a deliberate
// dose change re-baselines quickly — the percentage answers "peak or trough of the CURRENT
// regimen?", while regimen changes reach the AI through the protocol-change lines instead.
const RECENT_PEAK_LOOKBACK_H = 14 * 24

export interface DrawTiming {
  lastDoseDate: string
  lastDoseAmount: number
  daysSinceLastDose: number
  /** Modeled level at the draw as % of the highest modeled level in the prior ~4 weeks. */
  pctOfRecentPeak: number
  phase: 'rising' | 'near peak' | 'past peak'
}

/** Where a morning lab draw landed on the dosing curve. Null when no dose is recent enough
 * to still matter (or none precedes the draw at all). */
export function drawTiming(doses: PkDose[], model: PkModel, drawDate: string): DrawTiming | null {
  const drawH = Date.parse(`${drawDate}T08:00:00`) / MS_PER_HOUR
  const prior = doses
    .filter(d => doseHours(d) <= drawH)
    .sort((a, b) => doseHours(a) - doseHours(b))
  const last = prior.at(-1)
  if (!last) return null

  const r = ratesOf(model)
  const sinceH = drawH - doseHours(last)
  if (sinceH > r.cutoffH) return null

  let max = 0
  for (let h = drawH - RECENT_PEAK_LOOKBACK_H; h <= drawH; h += 6) {
    max = Math.max(max, exposureAt(prior, model, h))
  }
  const atDraw = exposureAt(prior, model, drawH)

  const tmax = peakHours(model)
  const phase = sinceH < 0.5 * tmax ? 'rising' : sinceH <= 2 * tmax ? 'near peak' : 'past peak'

  return {
    lastDoseDate: last.date,
    lastDoseAmount: last.amount,
    daysSinceLastDose: Math.round((sinceH / 24) * 10) / 10,
    pctOfRecentPeak: max > 0 ? Math.round((atDraw / max) * 100) : 0,
    phase
  }
}
