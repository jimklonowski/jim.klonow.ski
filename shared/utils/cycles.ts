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

export interface Cycle {
  id?: number
  name: string
  goal?: string | null
  /** YYYY-MM-DD. Week 1 day 1. */
  start_date: string
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

const DAY_MS = 86400000

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
  const start = cycle.start_date
  const end = cycleEnd(cycle)
  const out: CycleCheckpoint[] = [
    // A draw a day or two into the run still reads as baseline for slow esters.
    { key: 'baseline', label: 'baseline draw', windowFrom: shiftDays(start, -45), windowTo: shiftDays(start, 1) }
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

  const upcoming = cycles
    .filter(c => cycleStatusOn(c, today) === 'upcoming')
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  if (upcoming[0]) return upcoming[0]

  const recent = cycles
    .filter(c => cycleStatusOn(c, today) === 'done' && today <= shiftDays(cycleEnd(c), 56))
    .sort((a, b) => cycleEnd(b).localeCompare(cycleEnd(a)))
  return recent[0] ?? null
}
