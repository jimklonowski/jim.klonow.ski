// The hematocrit control panel's arithmetic (audit #43 item 59, /labs/hematocrit): where the
// reading sits on the action ladder, which draws fall inside the red-cell turnover window after
// a dose change (and so cannot yet show its effect), what each phlebotomy bought, and the iron
// the campaign costs against what the protocol puts back. Pure and framework-free, so
// tests/hematocrit.test.mjs pins every rule.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { ruleAnnotations } from './chartAnnotations.ts'
import { diffDays, roundTo, shiftDays } from './dates.ts'
import type { ProtocolRule } from './protocolRules.ts'

export type PhlebotomyKind = 'donation' | 'therapeutic'

/** A phlebotomies row (migration 0017). */
export interface Phlebotomy {
  id: number
  date: string
  kind: PhlebotomyKind
  /** Volume removed, mL; null when not recorded (a whole-blood donation is ~500). */
  ml: number | null
  /** The clinic's pre-donation hemoglobin, g/dL, when given. */
  pre_hgb: number | null
  notes: string | null
  created_at: string
}

export const PHLEBOTOMY_KINDS: Array<{ value: PhlebotomyKind, label: string }> = [
  { value: 'donation', label: 'Blood donation' },
  { value: 'therapeutic', label: 'Therapeutic phlebotomy' }
]

/** What a whole-blood donation removes when no volume was recorded. */
export const DEFAULT_DONATION_ML = 500

// --- the ladder ---

export type LadderTone = 'ok' | 'warn' | 'danger'

export interface LadderRung {
  /** Hematocrit % at which the rung is reached. */
  at: number
  label: string
  tone: LadderTone
  /** What the rung calls for. */
  action: string
}

/**
 * The steps of the campaign, bottom to top. 50 is the lab's own flag line (ref ≤ 51.1 here, but
 * the clinic worries from 50); 52 is where the protocol changes (dose down, hCG down, the iron
 * question); 54 is where blood comes out and the dose stops — the viscosity and clot-risk line.
 */
export const HCT_LADDER: readonly LadderRung[] = [
  { at: 50, label: 'watch', tone: 'warn', action: 'hydrate, retest in 6 weeks, hold any dose increase' },
  { at: 52, label: 'act', tone: 'warn', action: 'dose or hCG down, book the retest, weigh a donation' },
  { at: 54, label: 'stop', tone: 'danger', action: 'phlebotomy, dose paused until a draw reads under 52' }
]

/** The highest rung a reading has reached, or null below the ladder. */
export function ladderRung(hct: number | null | undefined): LadderRung | null {
  if (hct == null) return null
  let reached: LadderRung | null = null
  for (const rung of HCT_LADDER) if (hct >= rung.at) reached = rung
  return reached
}

/** The next rung above a reading and the gap to it, or null at the top. */
export function nextRung(hct: number): { rung: LadderRung, gap: number } | null {
  const rung = HCT_LADDER.find(r => hct < r.at)
  return rung ? { rung, gap: roundTo(rung.at - hct, 1) } : null
}

// --- the turnover window ---

/** Red cells live about this long; a dose change takes this long to show its full effect. */
export const RBC_TURNOVER_DAYS = 120

/** Compounds whose dose moves red-cell mass — the handovers these make open a window. */
export const RBC_DRIVERS = /testosterone|hcg|methenolone|primobolan|oxandrolone|anavar|boldenone|equipoise|nandrolone|trenbolone/i

export interface TransitionalWindow {
  from: string
  /** Inclusive last day. */
  to: string
  /** The change the window follows, as the chart labels it: "T 100→75 mg". */
  change: string
}

/**
 * The RBC_TURNOVER_DAYS after every dose change, start and stop of an erythropoietic compound
 * (chartAnnotations' dose lines, over the rules of those compounds only — a predecessor chain
 * stays whole because its rows share the compound). A draw inside one is "transitional": flat
 * or still rising is the expected reading, not a failure of the change.
 */
export function transitionalWindows(rules: ProtocolRule[]): TransitionalWindow[] {
  return ruleAnnotations(rules.filter(r => RBC_DRIVERS.test(r.compound)))
    .filter(a => a.kind === 'dose')
    .map(a => ({ from: a.from, to: shiftDays(a.from, RBC_TURNOVER_DAYS - 1), change: a.text }))
    .sort((a, b) => a.from.localeCompare(b.from))
}

/** The window a date falls in — the latest change when several overlap — or null. */
export function transitionalFor(date: string, windows: TransitionalWindow[]): TransitionalWindow | null {
  return [...windows].reverse().find(w => date >= w.from && date <= w.to) ?? null
}

// --- draws and phlebotomies ---

/** A blood draw as the panel reads it: the CBC values it needs. */
export interface HctDraw {
  date: string
  hematocrit: number | null
  hemoglobin: number | null
  ferritin: number | null
}

export function hctDraws(entries: ReadonlyArray<{ date: string, markers: Record<string, number | null | undefined> }>): HctDraw[] {
  return entries
    .filter(e => e.markers.hematocrit != null || e.markers.hemoglobin != null || e.markers.ferritin != null)
    .map(e => ({ date: e.date, hematocrit: e.markers.hematocrit ?? null, hemoglobin: e.markers.hemoglobin ?? null, ferritin: e.markers.ferritin ?? null }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface PhlebotomyEffect {
  phlebotomy: Phlebotomy
  /** The last hematocrit reading on or before the visit. */
  before: { date: string, value: number } | null
  /** The first hematocrit reading after it. */
  after: { date: string, value: number } | null
  /** after − before, one decimal; null without both. */
  hctDelta: number | null
}

/** What each visit bought: the Hct draw before it against the first draw after. */
export function phlebotomyEffects(phlebotomies: Phlebotomy[], draws: HctDraw[]): PhlebotomyEffect[] {
  const hct = draws.filter((d): d is HctDraw & { hematocrit: number } => d.hematocrit != null)
  return [...phlebotomies].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).map((p) => {
    const b = hct.filter(d => d.date <= p.date).at(-1) ?? null
    const a = hct.find(d => d.date > p.date) ?? null
    const before = b ? { date: b.date, value: b.hematocrit } : null
    const after = a ? { date: a.date, value: a.hematocrit } : null
    return { phlebotomy: p, before, after, hctDelta: before && after ? roundTo(after.value - before.value, 1) : null }
  })
}

export interface HctHeadline {
  current: { date: string, value: number } | null
  rung: LadderRung | null
  next: { rung: LadderRung, gap: number } | null
  /** The window today sits in, if any — the change is still working through. */
  transitional: TransitionalWindow | null
  /** Days since that change, when inside a window. */
  daysIn: number | null
  /** Whether the current reading itself was taken inside a window. */
  currentIsTransitional: boolean
}

export function hctHeadline(draws: HctDraw[], windows: TransitionalWindow[], today: string): HctHeadline {
  const last = draws.filter(d => d.hematocrit != null && d.date <= today).at(-1) ?? null
  const current = last ? { date: last.date, value: last.hematocrit! } : null
  const transitional = transitionalFor(today, windows)
  return {
    current,
    rung: ladderRung(current?.value),
    next: current ? nextRung(current.value) : null,
    transitional,
    daysIn: transitional ? diffDays(transitional.from, today) : null,
    currentIsTransitional: !!current && transitionalFor(current.date, windows) != null
  }
}

// --- the iron ledger ---

/** Iron carried out per mL of whole blood (about 1 mg per 2 mL; a 500 mL donation is ~250 mg). */
export const IRON_MG_PER_ML_BLOOD = 0.5
/** The share of an oral dose that is absorbed in a replete adult — the rest never arrives. */
export const ORAL_IRON_ABSORBED = 0.15

/** An oral iron source over a span: the standing supplement, or a loading round. */
export interface IronSpan {
  label: string
  from: string
  /** Inclusive; null means still running. */
  to: string | null
  mgPerDay: number
}

export interface IronLedger {
  from: string
  to: string
  days: number
  /** Iron removed with the blood, mg. */
  lostMg: number
  /** Oral elemental iron taken, mg. */
  takenMg: number
  /** Taken × ORAL_IRON_ABSORBED. */
  absorbedMg: number
  /** absorbedMg − lostMg. */
  netMg: number
  /** Each source's share of takenMg over the span. */
  sources: Array<{ label: string, mg: number, days: number }>
  phlebotomies: number
}

/** The campaign's iron balance over [from, to]: blood out against oral iron in. An estimate on
 * both sides, labelled as one on the page. */
export function ironLedger(phlebotomies: Phlebotomy[], spans: IronSpan[], from: string, to: string): IronLedger {
  const inRange = phlebotomies.filter(p => p.date >= from && p.date <= to)
  const lostMg = inRange.reduce((s, p) => s + (p.ml ?? DEFAULT_DONATION_ML) * IRON_MG_PER_ML_BLOOD, 0)
  const sources = spans.flatMap((span) => {
    const a = span.from > from ? span.from : from
    const b = span.to && span.to < to ? span.to : to
    const days = b >= a ? diffDays(a, b) + 1 : 0
    return days > 0 ? [{ label: span.label, mg: roundTo(span.mgPerDay * days, 0), days }] : []
  })
  const takenMg = sources.reduce((s, x) => s + x.mg, 0)
  const absorbedMg = roundTo(takenMg * ORAL_IRON_ABSORBED, 0)
  return { from, to, days: diffDays(from, to) + 1, lostMg: roundTo(lostMg, 0), takenMg, absorbedMg, netMg: roundTo(absorbedMg - lostMg, 0), sources, phlebotomies: inRange.length }
}

/** The elemental mg in a dose label like "50 mg" / "75mg"; null for anything else. */
export function ironMgOf(doseLabel: string | null | undefined): number | null {
  const m = /^\s*([\d.]+)\s*mg\b/i.exec(doseLabel ?? '')
  return m ? Number(m[1]) : null
}
