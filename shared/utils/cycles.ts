// Cycle planning — a dated, finite protocol phase (a "blast"/"run") layered on top of the
// standing schedule. Unlike PROTOCOL_RULES (hand-maintained code, changes rarely), cycles live
// in the `cycles` D1 table because they're the thing that gets planned ahead, shifted, cut
// short, and reviewed afterward.
//
// Everything in the plan is stored RELATIVE to the start date (week numbers, not dates), so
// "actually I'll start next Monday" is a single field edit and every phase, checkpoint, and
// overlay moves with it. This module derives the absolute-dated views: ProtocolRule-shaped
// cadences for the adherence panel and calendar rings, synthetic future doses for the PK
// overlay, and lab-draw checkpoints.
//
// A start you haven't picked yet is a first-class state: start_precision 'month'/'quarter'
// means the plan is on file for "sometime in Oct 2026" with start_date holding only an anchor.
// Those cycles derive nothing dated (see isTentative) — the anchor is never mistaken for a
// commitment — which is why start_date stays non-null and all the math below stays total.
//
// Shared (app + server) because the pages and the AI prompt context (cycleContext in
// server/utils/protocol.ts) must agree on the same status/day/window math.

import type { PkDose } from './pk'

export interface CyclePlanItem {
  /** Must match a KNOWN_COMPOUNDS name — that's what links colors, PK models, and dose logs. */
  compound: string
  dose: number
  unit: 'mg' | 'mcg' | 'iu'
  /** Scheduled weekdays, 0=Sun … 6=Sat. All seven = daily. */
  weekdays: number[]
  /** First cycle week this compound runs, 1-based. */
  fromWeek: number
  /** Last cycle week, inclusive; null/absent = through the end of the cycle. */
  toWeek?: number | null
}

/**
 * How much of a cycle's `start_date` is an actual commitment. 'day' is a picked start; 'month'
 * and 'quarter' mean "sometime in Oct 2026" / "sometime in Q4 2026" — the plan is on file but
 * not scheduled, so nothing dated may be derived from it (see isTentative).
 */
export type StartPrecision = 'day' | 'month' | 'quarter'

export interface Cycle {
  id?: number
  name: string
  goal?: string | null
  /**
   * YYYY-MM-DD. Week 1 day 1 at 'day' precision; otherwise the first day of the target month
   * or quarter, standing in as an anchor for a start that hasn't been picked yet.
   */
  start_date: string
  /** Absent on rows written before tentative starts existed — reads as 'day'. */
  start_precision?: StartPrecision
  planned_weeks: number
  /** Set when the cycle is ended off-plan (early on bad labs, or extended); null = as planned. */
  actual_end?: string | null
  compounds: CyclePlanItem[]
  notes?: string | null
  created_at?: string
}

export type CycleStatus = 'upcoming' | 'active' | 'done'

/** Structurally identical to app/data/journal.ts's ProtocolRule, redeclared here because
 * shared code can't import from the app dir. TS structural typing makes them interchangeable. */
export interface CycleRule {
  compound: string
  doseLabel: string
  weekdays: number[]
  from: string
  to?: string | null
}

/** The markers that gate anabolic decisions — the ones cycle views diff against baseline.
 * Keys match app/data/biomarkers.ts. */
export const GATING_MARKERS = ['hdl', 'ldl', 'alt', 'ast', 'hematocrit', 'ferritin', 'estradiol']

/** How stale a draw may be and still read as a cycle's pre-start baseline. */
export const BASELINE_LOOKBACK_DAYS = 45

const DAY_MS = 86400000

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function startPrecisionOf(cycle: Cycle): StartPrecision {
  return cycle.start_precision ?? 'day'
}

/**
 * True when `start_date` is a placeholder for a month or quarter rather than a picked day.
 *
 * A tentative cycle is deliberately inert: it has no real timeline, so its cadence rules,
 * planned doses, and checkpoint windows all come back empty, and it never leaves 'upcoming'.
 * That keeps guessed dates from manufacturing calendar rings, adherence expectations, and
 * lab-draw deadlines that nobody actually planned. Setting a day is what brings it to life.
 */
export function isTentative(cycle: Cycle): boolean {
  return startPrecisionOf(cycle) !== 'day'
}

/** 1-4 for the quarter containing a 1-based month. */
function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1
}

/**
 * The canonical anchor for a precision: the first day of the month or quarter containing
 * `date`. Storing only anchors means "Oct 2026" is one date, not whichever day was on screen
 * when the precision was switched.
 */
export function startAnchor(date: string, precision: StartPrecision): string {
  if (precision === 'day') return date
  const [year, month] = date.split('-').map(Number) as [number, number]
  const anchorMonth = precision === 'quarter' ? (quarterOf(month) - 1) * 3 + 1 : month
  return `${year}-${String(anchorMonth).padStart(2, '0')}-01`
}

/** How an anchor date reads at a coarse precision: "Oct 2026", "Q4 2026". */
export function periodLabel(anchor: string, precision: 'month' | 'quarter'): string {
  const [year, month] = anchor.split('-').map(Number) as [number, number]
  return precision === 'quarter'
    ? `Q${quarterOf(month)} ${year}`
    : `${MONTH_NAMES[month - 1]} ${year}`
}

/**
 * How a tentative start reads — "Oct 2026", "Q4 2026" — or null at 'day' precision, so
 * callers fall through to their own exact-date formatting (formatDate lives in the app layer).
 */
export function tentativeStartLabel(cycle: Cycle): string | null {
  const precision = startPrecisionOf(cycle)
  return precision === 'day' ? null : periodLabel(cycle.start_date, precision)
}

export function shiftDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

/** Whole days from a to b (positive when b is later). Noon anchors dodge DST edges. */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / DAY_MS)
}

/** Last day of the plan as written (start + weeks, inclusive). */
export function plannedEnd(cycle: Cycle): string {
  return shiftDays(cycle.start_date, cycle.planned_weeks * 7 - 1)
}

/** Last day of the cycle as lived — an off-plan actual_end (early or extended) wins. */
export function cycleEnd(cycle: Cycle): string {
  return cycle.actual_end ?? plannedEnd(cycle)
}

export function cycleStatusOn(cycle: Cycle, today: string): CycleStatus {
  // A tentative cycle can't be under way or over — it has no committed start to have passed.
  // It stays upcoming however long its placeholder month sits in the past, which is also the
  // nudge: a plan you never scheduled keeps showing up as unstarted.
  if (isTentative(cycle)) return 'upcoming'
  if (today < cycle.start_date) return 'upcoming'
  return today > cycleEnd(cycle) ? 'done' : 'active'
}

export interface CycleProgress {
  /** 1-based day/week of the cycle for `today`, clamped to the cycle span. */
  day: number
  week: number
  totalDays: number
  totalWeeks: number
  /** 0–100, how far through the cycle `today` is. */
  pct: number
}

export function cycleProgress(cycle: Cycle, today: string): CycleProgress {
  const totalDays = diffDays(cycle.start_date, cycleEnd(cycle)) + 1
  const day = Math.min(Math.max(diffDays(cycle.start_date, today) + 1, 1), totalDays)
  return {
    day,
    week: Math.ceil(day / 7),
    totalDays,
    totalWeeks: Math.ceil(totalDays / 7),
    pct: Math.round((day / totalDays) * 100)
  }
}

export function doseLabelOf(item: CyclePlanItem): string {
  return `${item.dose} ${item.unit === 'iu' ? 'IU' : item.unit}`
}

/** Absolute date window for one plan item, clamped to an early actual_end. Null when the
 * cycle was cut before the item's first week ever arrived. */
export function itemWindow(cycle: Cycle, item: CyclePlanItem): { from: string, to: string } | null {
  const from = shiftDays(cycle.start_date, (item.fromWeek - 1) * 7)
  const planned = item.toWeek != null ? shiftDays(cycle.start_date, item.toWeek * 7 - 1) : plannedEnd(cycle)
  const to = cycle.actual_end != null && cycle.actual_end < planned ? cycle.actual_end : planned
  return to < from ? null : { from, to }
}

/** The plan as dated cadence rules — the shape computeAdherence/scheduledFor consume. */
export function cycleRules(cycle: Cycle): CycleRule[] {
  // No committed start, no dated cadence. This is the single choke point every scoring
  // consumer reaches through (mergeRules → effectiveRules → calendar rings, cycleAdherence),
  // so returning nothing here is what keeps a tentative plan from putting rings on guessed
  // weekdays, overriding the standing schedule, or being scored against days it never claimed.
  if (isTentative(cycle)) return []

  const out: CycleRule[] = []
  for (const item of cycle.compounds) {
    const window = itemWindow(cycle, item)
    if (!window) continue
    out.push({
      compound: item.compound,
      doseLabel: doseLabelOf(item),
      weekdays: item.weekdays,
      from: window.from,
      to: window.to
    })
  }
  return out
}

/** `rule` minus one date window — the pieces of a standing cadence left over when a cycle
 * item overrides the same compound for a stretch. */
function subtractWindow(rule: CycleRule, from: string, to: string): CycleRule[] {
  const ruleTo = rule.to ?? null
  if ((ruleTo != null && ruleTo < from) || rule.from > to) return [rule]
  const out: CycleRule[] = []
  if (rule.from < from) out.push({ ...rule, to: shiftDays(from, -1) })
  if (ruleTo == null || ruleTo > to) out.push({ ...rule, from: shiftDays(to, 1) })
  return out
}

/**
 * Standing rules + every cycle's rules, with override semantics: where a cycle plans a
 * compound the standing schedule also carries (a TC dose bump for the blast, say), the
 * standing rule is split around the cycle window so the cycle's cadence owns it — and the
 * standing one resumes by itself when the cycle ends. Windows self-limit by date, so passing
 * every cycle (past, active, upcoming) is correct: adherence and the calendar already filter
 * rules per date.
 */
export function mergeRules(standing: CycleRule[], cycles: Cycle[]): CycleRule[] {
  const overrides = new Map<string, Array<{ from: string, to: string }>>()
  const fromCycles: CycleRule[] = []
  for (const cycle of cycles) {
    for (const rule of cycleRules(cycle)) {
      fromCycles.push(rule)
      const list = overrides.get(rule.compound) ?? []
      list.push({ from: rule.from, to: rule.to! })
      overrides.set(rule.compound, list)
    }
  }

  const kept: CycleRule[] = []
  for (const rule of standing) {
    let segments = [rule]
    for (const win of overrides.get(rule.compound) ?? []) {
      segments = segments.flatMap(seg => subtractWindow(seg, win.from, win.to))
    }
    kept.push(...segments)
  }
  return [...kept, ...fromCycles]
}

/** Every date a plan item calls for a dose of `compound`, as synthetic PkDose rows — the
 * planned exposure curve is just the real Bateman engine fed this instead of the dose log. */
export function plannedDoses(cycle: Cycle, compound: string): PkDose[] {
  // Deliberately NOT gated on isTentative, unlike cycleRules: the dose *count* here is
  // week-relative and so is real for a tentative plan — it's what stock coverage sums to
  // answer "is the fridge deep enough for this run?", the question you ask precisely while
  // the date is still loose. Only the dates attached to each dose are provisional, so it's
  // the one consumer that plots them on a real axis (the dossier's exposure overlay) that
  // opts out, not this.
  const dates: PkDose[] = []
  for (const item of cycle.compounds) {
    if (item.compound !== compound) continue
    const window = itemWindow(cycle, item)
    if (!window) continue
    for (let d = window.from; d <= window.to; d = shiftDays(d, 1)) {
      if (item.weekdays.includes(new Date(d + 'T12:00:00').getDay())) {
        dates.push({ date: d, amount: item.dose })
      }
    }
  }
  return dates.sort((a, b) => a.date.localeCompare(b.date))
}

// --- lab-draw checkpoints ---
// Derived heuristics, not stored data: nothing to configure, nothing to forget. Windows are
// generous because draws happen when life allows, not on the target day.

export type CheckpointKey = 'baseline' | 'mid' | 'end' | 'recovery'

export interface CycleCheckpoint {
  key: CheckpointKey
  label: string
  windowFrom: string
  windowTo: string
}

export function cycleCheckpoints(cycle: Cycle): CycleCheckpoint[] {
  // Every window is start-relative, so a tentative cycle has none to offer — a "mid-cycle
  // draw due Nov 15" derived from a guessed October would be an invented deadline. The advice
  // that survives ("have a fresh draw in hand when you pick a date") is presentation, not a
  // dated checkpoint, and lives in the views.
  if (isTentative(cycle)) return []

  const start = cycle.start_date
  const end = cycleEnd(cycle)
  const out: CycleCheckpoint[] = [
    // A draw a day or two into the run still reads as baseline for slow esters.
    { key: 'baseline', label: 'baseline draw', windowFrom: shiftDays(start, -BASELINE_LOOKBACK_DAYS), windowTo: shiftDays(start, 1) }
  ]
  const mid = shiftDays(start, Math.floor((diffDays(start, end) + 1) / 2))
  // Short (or cut-short) cycles fold the mid check into the end one.
  if (cycle.planned_weeks >= 8 && mid <= shiftDays(end, -21)) {
    out.push({ key: 'mid', label: 'mid-cycle draw', windowFrom: shiftDays(mid, -10), windowTo: shiftDays(mid, 10) })
  }
  out.push(
    { key: 'end', label: 'end-of-cycle draw', windowFrom: shiftDays(end, -10), windowTo: shiftDays(end, 3) },
    { key: 'recovery', label: 'recovery draw', windowFrom: shiftDays(end, 21), windowTo: shiftDays(end, 49) }
  )
  return out
}

export interface CheckpointState extends CycleCheckpoint {
  state: 'done' | 'due' | 'upcoming' | 'missed'
  /** The draw that satisfied the checkpoint, when one landed in the window. */
  drawDate: string | null
}

export function checkpointStates(cycle: Cycle, drawDates: string[], today: string): CheckpointState[] {
  const draws = [...drawDates].sort()
  return cycleCheckpoints(cycle).map((cp) => {
    const inWindow = draws.filter(d => d >= cp.windowFrom && d <= cp.windowTo)
    // Baseline wants the freshest pre-start picture; the others count as soon as any draw lands.
    const drawDate = (cp.key === 'baseline' ? inWindow.at(-1) : inWindow[0]) ?? null
    const state = drawDate != null
      ? 'done' as const
      : today > cp.windowTo
        ? 'missed' as const
        : today >= cp.windowFrom ? 'due' as const : 'upcoming' as const
    return { ...cp, state, drawDate }
  })
}

/**
 * The one cycle the home dashboard should talk about: an active one wins, else the nearest
 * upcoming, else one that ended recently enough that the recovery story is still live (its
 * recovery-draw window plus a week of grace). Null when cycles are ancient history.
 */
export function relevantCycle(cycles: Cycle[], today: string): Cycle | null {
  const active = cycles
    .filter(c => cycleStatusOn(c, today) === 'active')
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
  if (active[0]) return active[0]

  // A committed start outranks a tentative one, then soonest first: a run you've actually
  // scheduled deserves the countdown even when a loose plan is anchored earlier.
  const upcoming = cycles
    .filter(c => cycleStatusOn(c, today) === 'upcoming')
    .sort((a, b) =>
      Number(isTentative(a)) - Number(isTentative(b)) || a.start_date.localeCompare(b.start_date))
  if (upcoming[0]) return upcoming[0]

  const recent = cycles
    .filter(c => cycleStatusOn(c, today) === 'done' && today <= shiftDays(cycleEnd(c), 56))
    .sort((a, b) => cycleEnd(b).localeCompare(cycleEnd(a)))
  return recent[0] ?? null
}
