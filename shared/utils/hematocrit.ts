// The hematocrit control panel's arithmetic (audit #43 item 59, /labs/hematocrit): where the
// reading sits on the action ladder, which draws fall inside the red-cell turnover window after
// a dose change (and so cannot yet show its effect), what each phlebotomy bought, and the iron
// the campaign costs against what the protocol puts back. Pure and framework-free, so
// tests/hematocrit.test.mjs pins every rule.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { ruleAnnotations } from './chartAnnotations.ts'
import { cycleRules, type Cycle } from './cycles.ts'
import { diffDays, roundTo, shiftDays } from './dates.ts'
import type { ProtocolRule } from './protocolRules.ts'
import { BEFORE_RECORDS, parseWeekdays, type ProtocolItemRow, type ProtocolVersionRow } from './protocolStore.ts'

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
/** A CBC this long after a phlebotomy shows what it bought (the calendar feed books it). */
export const PHLEBOTOMY_RETEST_DAYS = 42

// --- the ladder ---

export type LadderTone = 'ok' | 'warn' | 'danger'

export interface LadderRung {
  /** Hematocrit % at which the rung is reached. */
  at: number
  label: string
  tone: LadderTone
  /** What the rung calls for. */
  action: string
  /** What it calls for while blood donation is deferred (an isotretinoin course), when that differs. */
  deferredAction?: string
}

/**
 * The steps of the campaign, bottom to top. 50 is the lab's own flag line (ref ≤ 51.1 here, but
 * the clinic worries from 50); 52 is where the protocol changes (dose down, hCG down, the iron
 * question); 54 is where blood comes out and the dose stops — the viscosity and clot-risk line.
 */
export const HCT_LADDER: readonly LadderRung[] = [
  { at: 50, label: 'watch', tone: 'warn', action: 'hydrate, retest in 6 weeks, hold any dose increase' },
  {
    at: 52,
    label: 'act',
    tone: 'warn',
    action: 'dose or hCG down, book the retest, weigh a donation',
    deferredAction: 'dose or hCG down, book the retest; no donation — blood out only as a therapeutic phlebotomy on a prescriber\'s order'
  },
  {
    at: 54,
    label: 'stop',
    tone: 'danger',
    action: 'phlebotomy, dose paused until a draw reads under 52',
    deferredAction: 'therapeutic phlebotomy on a prescriber\'s order, dose paused until a draw reads under 52'
  }
]

/** The rung's action, or its deferred one while donation is off the table. */
export function rungAction(rung: LadderRung, donationDeferred: boolean): string {
  return donationDeferred && rung.deferredAction ? rung.deferredAction : rung.action
}

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
export function transitionalWindows(rules: readonly ProtocolRule[]): TransitionalWindow[] {
  return ruleAnnotations(rules.filter(r => RBC_DRIVERS.test(r.compound)))
    .filter(a => a.kind === 'dose')
    .map(a => ({ from: a.from, to: shiftDays(a.from, RBC_TURNOVER_DAYS - 1), change: a.text }))
    .sort((a, b) => a.from.localeCompare(b.from))
}

/** The window a date falls in — the latest change when several overlap — or null. */
export function transitionalFor(date: string, windows: readonly TransitionalWindow[]): TransitionalWindow | null {
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
  /** The first hematocrit reading after it — after the group's last visit when it shares one. */
  after: { date: string, value: number } | null
  /** after − before, one decimal; null without both. A shared group's combined change. */
  hctDelta: number | null
  /** The other visits with no Hct draw between them and this one: the delta is theirs together. */
  sharedWith: string[]
}

/**
 * What each visit bought: the Hct draw before it against the first draw after. Visits with no
 * draw between them are one group (item 88): no reading can split the drop between them, so
 * each carries the group's before, after and combined delta, and names the others it shares
 * with — never one drop credited twice. A draw on a visit's own day counts as before it.
 */
export function phlebotomyEffects(phlebotomies: Phlebotomy[], draws: HctDraw[]): PhlebotomyEffect[] {
  const hct = draws.filter((d): d is HctDraw & { hematocrit: number } => d.hematocrit != null)
  const drawBetween = (from: string, to: string) => hct.some(d => d.date > from && d.date <= to)
  const groups: Phlebotomy[][] = []
  for (const p of [...phlebotomies].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    const group = groups.at(-1)
    if (group && !drawBetween(group.at(-1)!.date, p.date)) group.push(p)
    else groups.push([p])
  }
  return groups.flatMap((group) => {
    const b = hct.filter(d => d.date <= group[0]!.date).at(-1) ?? null
    const a = hct.find(d => d.date > group.at(-1)!.date) ?? null
    const before = b ? { date: b.date, value: b.hematocrit } : null
    const after = a ? { date: a.date, value: a.hematocrit } : null
    const hctDelta = before && after ? roundTo(after.value - before.value, 1) : null
    return group.map(p => ({ phlebotomy: p, before, after, hctDelta, sharedWith: group.filter(o => o !== p).map(o => o.date) }))
  })
}

// --- reading tags (item 101) ---

/**
 * Hemoglobin and hematocrit climb back from a 500 mL draw-off over about this long (iron-replete
 * men recover in four to six weeks; longer when ferritin is low). A CBC inside this window reads
 * the hole the visit made, not where the protocol has the marker.
 */
export const PHLEBOTOMY_EFFECT_DAYS = 56

/** The markers a dose change of an erythropoietic compound moves — the turnover window's. */
export const RBC_MASS_MARKERS: ReadonlySet<string> = new Set(['hematocrit', 'hemoglobin', 'rbc'])
/** The markers a phlebotomy moves: red-cell mass and the iron that left with it. */
export const PHLEBOTOMY_MARKERS: ReadonlySet<string> = new Set([...RBC_MASS_MARKERS, 'ferritin'])

export interface ReadingTag {
  kind: 'transitional' | 'post-phlebotomy'
  /** The chip: "transitional" / "post-phlebotomy". */
  short: string
  /** The explanation, for a title or a note line. */
  text: string
}

/**
 * Why a reading of `marker` on `date` may not mean what it says: inside a turnover window after a
 * dose change (red-cell markers only), or within PHLEBOTOMY_EFFECT_DAYS after a phlebotomy (those
 * and ferritin). A draw on the visit's own day is before it, as phlebotomyEffects reads it. The
 * card, the ledger and the labs history rows all wear these; /labs/hematocrit has the long form.
 */
export function readingTags(marker: string, date: string, windows: readonly TransitionalWindow[], phlebotomies: readonly Phlebotomy[]): ReadingTag[] {
  const tags: ReadingTag[] = []
  const after = (from: string) => { const n = diffDays(from, date); return `${n} day${n === 1 ? '' : 's'} after` }
  if (RBC_MASS_MARKERS.has(marker)) {
    const w = transitionalFor(date, windows)
    if (w) tags.push({ kind: 'transitional', short: 'transitional', text: `${after(w.from)} ${w.change} — red cells turn over on a ~${RBC_TURNOVER_DAYS}-day cycle, so this reading cannot yet show that change's full effect` })
  }
  if (PHLEBOTOMY_MARKERS.has(marker)) {
    const p = [...phlebotomies].filter(p => p.date < date && diffDays(p.date, date) <= PHLEBOTOMY_EFFECT_DAYS).sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    if (p) {
      const what = p.kind === 'donation' ? 'blood donation' : 'therapeutic phlebotomy'
      const moved = marker === 'ferritin' ? 'a lower ferritin here is the iron that left with the blood' : 'a lower reading here is the blood taken out'
      tags.push({ kind: 'post-phlebotomy', short: 'post-phlebotomy', text: `${after(p.date)} the ${p.date} ${what} — ${moved}, not a change in the protocol` })
    }
  }
  return tags
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

/**
 * Elemental iron by weight in the common salts (item 89): a "325 mg ferrous sulfate" tablet is
 * 65 mg of iron. A label naming no salt, or saying "elemental", is read as the iron itself —
 * bisglycinate, carbonyl and polysaccharide labels state it that way.
 */
export const IRON_SALT_FRACTIONS: ReadonlyArray<readonly [RegExp, number]> = [
  [/ferrous\s+sulf/i, 0.2],
  [/ferrous\s+gluconate/i, 0.12],
  [/ferrous\s+fumarate/i, 0.33]
]

/** The elemental mg in a dose label: "50 mg", "2 x 25 mg", "325 mg ferrous sulfate" → 65; null
 * for anything without a mg figure. */
export function ironMgOf(doseLabel: string | null | undefined): number | null {
  const text = doseLabel ?? ''
  const m = /(?:^|\s|\()(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*mg\b/i.exec(text)
  if (!m) return null
  const mg = Number(m[2]) * (m[1] ? Number(m[1]) : 1)
  if (/elemental/i.test(text)) return mg
  const salt = IRON_SALT_FRACTIONS.find(([re]) => re.test(text))
  return salt ? Math.round(mg * salt[1]) : mg
}

/**
 * Every oral iron source as spans: each dated version of every protocol item named iron — of
 * any kind but as-needed and any category, since a supplement-category standing item is filed
 * among the stack rows, not the standing meds (item 89: the ledger used to read only those) —
 * at its weekday cadence, plus each iron cycle's rows (a loading round). A version with no
 * fixed days is counted daily and says so in its label.
 */
export function ironSpansFrom(
  items: ReadonlyArray<Pick<ProtocolItemRow, 'id' | 'name' | 'kind'>>,
  versions: ReadonlyArray<Pick<ProtocolVersionRow, 'item_id' | 'from_date' | 'to_date' | 'dose_label' | 'weekdays'>>,
  cycles: readonly Cycle[]
): IronSpan[] {
  const spans: IronSpan[] = []
  for (const item of items) {
    if (!/iron/i.test(item.name) || item.kind === 'as_needed') continue
    for (const v of versions.filter(v => v.item_id === item.id)) {
      const mg = ironMgOf(v.dose_label)
      if (mg == null) continue
      const days = parseWeekdays(v.weekdays)
      const perWeek = days?.length ?? 7
      const cadence = days == null ? ' · no fixed days, counted daily' : perWeek < 7 ? ` ×${perWeek}/wk` : ''
      spans.push({ label: `${item.name} ${v.dose_label}${cadence}`, from: v.from_date ?? BEFORE_RECORDS, to: v.to_date, mgPerDay: roundTo((mg * perWeek) / 7, 2) })
    }
  }
  for (const c of cycles) {
    for (const r of cycleRules(c)) {
      const mg = /iron/i.test(r.compound) ? ironMgOf(r.doseLabel) : null
      if (mg != null) spans.push({ label: `${c.name} (${r.doseLabel})`, from: r.from, to: r.to ?? null, mgPerDay: roundTo((mg * r.weekdays.length) / 7, 2) })
    }
  }
  return spans
}
