// The shape of the standing protocol and the math over it: ProtocolRule (a logged, weekday-
// scheduled compound — one row per cadence run, with its dose steps), StandingCompound (a daily
// med deliberately not in the dose log) and AsNeededCompound, plus due-day resolution and the
// planned-vs-logged tally. The rows themselves live in the protocol tables (protocol_items /
// protocol_versions, edited on /journal/protocol — the protocol plan) and are mapped into these
// shapes by ./protocolStore.ts; server/utils/protocolLoader.ts reads them per request and the
// app gets them through useProtocol(). The AI prompts' schedule prose is generated from the same
// shapes (protocolSchedule in ./protocolProse.ts), so a rule's notes are prompt text:
// pronoun-free, written to say how to read the data, not just what changed.
//
// Shared because both sides score against the rules: the adherence panel and calendar rings in
// the app (app/utils/adherence.ts), and the digest prompts on the server, which precompute "what
// was due today / this week, what was logged" (tallySchedule) so the model never has to work
// out weekdays from dates itself — it was guessing at them before.
//
// As-needed compounds deliberately have no rule — sporadic logging is the plan, not a lapse. The
// demo sandbox carries its own schedule (scripts/demo/generate-demo-data.mjs), with weekdays that
// re-anchor nightly alongside its doses.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping,
// which can't resolve extension-less paths the way Vite does.
import { shiftDays, weekdayOf } from './dates.ts'

export interface ProtocolRule {
  compound: string
  /** Display only — adherence checks whether a dose was logged, not the amount. */
  doseLabel: string
  /** Scheduled weekdays, 0=Sun … 6=Sat. All seven = daily. */
  weekdays: number[]
  /** First date this cadence applies; adherence and calendar rings start here. */
  from: string
  /** Set when a compound leaves the schedule; keep the row for history. */
  to?: string | null
  /** Given by injection: "per injection" wording, and the prompts' "only injectables" line. */
  injected?: boolean
  /**
   * The dose over time, oldest first, when it has changed: each step holds from its date until
   * the next. The AI prompts read the step in force on their as-of date and say what it changed
   * from, so a summary regenerated for an old draw sees that day's dose, not today's. The last
   * step's label must equal doseLabel (tests/protocolProse.test.mjs holds them equal).
   */
  doses?: DoseStep[]
  /** Prompt clause after the dose while it runs — reasons, context. */
  note?: string
  /** Prompt clause once `to` has passed: why it stopped. */
  stopNote?: string
}

export interface DoseStep {
  /** First day at this dose, YYYY-MM-DD. */
  from: string
  label: string
}

/** The step in force on `date`, and the one before it; both null for a rule without steps. */
export function doseStepOn(rule: ProtocolRule, date: string): { step: DoseStep | null, previous: DoseStep | null } {
  const steps = rule.doses ?? []
  let i = -1
  while (i + 1 < steps.length && steps[i + 1]!.from <= date) i++
  return { step: steps[i] ?? null, previous: steps[i - 1] ?? null }
}

/** The dose on `date`: its step's label, or doseLabel for a rule with no steps (or before them). */
export function doseLabelOn(rule: ProtocolRule, date: string): string {
  return doseStepOn(rule, date).step?.label ?? rule.doseLabel
}

/**
 * The row this one took over from: same compound, ending the day before this one starts. A
 * cadence change is two rows (see PROTOCOL_RULES), and mergeRules splits a standing rule around
 * a cycle the same way, so a handover reads everywhere as one compound changing — the prose
 * names the change, the chart draws one line, and the old row never reads as "discontinued".
 */
export function predecessorOf(rule: ProtocolRule, rules: ProtocolRule[]): ProtocolRule | null {
  return rules.find(r => r !== rule && r.compound === rule.compound && r.to != null && shiftDays(r.to, 1) === rule.from) ?? null
}

/** The row that takes over the day after this one ends, if any. */
export function successorOf(rule: ProtocolRule, rules: ProtocolRule[]): ProtocolRule | null {
  if (rule.to == null) return null
  const next = shiftDays(rule.to, 1)
  return rules.find(r => r !== rule && r.compound === rule.compound && r.from === next) ?? null
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Monday-first, since that's how a week reads. */
export function mondayFirst(weekdays: number[]): number[] {
  return [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
}

/** 'daily' or 'Mon+Thu' — the cadence as the prompts and the chart labels spell it. */
export function cadenceOf(weekdays: number[]): string {
  if (weekdays.length === 7) return 'daily'
  return mondayFirst(weekdays).map(d => DAY_SHORT[d]).join('+')
}

// doseLabel is the current dose, which is what the app displays. A dose change is a new version
// of the item in protocol_versions; the mapper (./protocolStore.ts) folds consecutive versions on
// the same weekdays into one rule and its `doses` steps. A CADENCE change is a new rule, because
// `weekdays` is per rule: the old row gets `to` (its past days stay due and scored) and a row for
// the same compound starts the next day. predecessorOf / successorOf tie the pair together
// wherever it would otherwise read as a stop and a start.

export interface StandingCompound {
  compound: string
  /** First day of the range (may predate the dose log — the timeline clamps it). */
  from: string
  /** Last day of the range, or null while ongoing. */
  to: string | null
  /** Dose/form for the timeline tooltip and the prompts, e.g. "7 mg gummy". */
  label: string
  /** Prompt clause: what it is for and how it bears on the data. */
  note?: string
}

/** Taken when something calls for it, so gaps in the log are the plan. No rule, no rings. */
export interface AsNeededCompound {
  compound: string
  /** Prompt clause: what it is taken for. */
  note: string
}

export function ruleActiveOn(rule: ProtocolRule, date: string): boolean {
  return date >= rule.from && (rule.to == null || date <= rule.to)
}

/** In force on `date`, and `date`'s weekday is one the rule calls for. */
export function ruleDueOn(rule: ProtocolRule, date: string): boolean {
  return ruleActiveOn(rule, date) && rule.weekdays.includes(weekdayOf(date))
}

/** Rules whose cadence calls for a dose on this date. */
export function scheduledFor(date: string, rules: ProtocolRule[]): ProtocolRule[] {
  return rules.filter(r => ruleDueOn(r, date))
}

/** The rule's first due date strictly after `date`, or null if none falls within `horizonDays`. */
export function nextDueDay(rule: ProtocolRule, date: string, horizonDays = 7): string | null {
  let d = date
  for (let i = 0; i < horizonDays; i++) {
    d = shiftDays(d, 1)
    if (ruleDueOn(rule, d)) return d
  }
  return null
}

export interface ScheduleTally {
  rule: ProtocolRule
  /** Due dates in the window that had a dose logged. */
  hit: string[]
  /** Due dates in the window that passed without a dose. */
  missed: string[]
  /** Due today with no dose yet — open, not a miss, while the day can still be dosed. */
  pending: string | null
  /** Dates in the window with a dose on a day the rule didn't call for one (slid or extra). */
  offSchedule: string[]
}

/**
 * Planned-vs-logged for every rule in force somewhere in [start, end]. `doseDates` maps
 * compound → the dates it was logged. Days after `today` are ignored and `today` itself only
 * counts once logged — the same convention as computeAdherence — so a digest written mid-day
 * (or for a week still under way) never reports a dose as missed while it can still happen.
 * Rules with nothing due in the window are still returned, so callers can say "not due today".
 */
export function tallySchedule(
  rules: ProtocolRule[],
  start: string,
  end: string,
  doseDates: Map<string, Set<string>>,
  today: string
): ScheduleTally[] {
  const out: ScheduleTally[] = []
  for (const rule of rules) {
    if (rule.from > end || (rule.to != null && rule.to < start)) continue
    const logged = doseDates.get(rule.compound) ?? new Set<string>()
    const tally: ScheduleTally = { rule, hit: [], missed: [], pending: null, offSchedule: [] }
    for (let d = start; d <= end && d <= today; d = shiftDays(d, 1)) {
      // Off-schedule only counts inside the rule's own window: a cycle that overrides this
      // compound splits the standing rule around itself, and the cycle's rule owns those days.
      if (!ruleActiveOn(rule, d)) continue
      const due = rule.weekdays.includes(weekdayOf(d))
      if (logged.has(d)) (due ? tally.hit : tally.offSchedule).push(d)
      else if (due && d < today) tally.missed.push(d)
      else if (due) tally.pending = d
    }
    out.push(tally)
  }
  return out
}
