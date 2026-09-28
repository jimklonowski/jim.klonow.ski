// The standing protocol, as data — the one place to edit when it changes. Three lists:
// PROTOCOL_RULES (logged, weekday-scheduled compounds), STANDING_COMPOUNDS (daily meds that are
// deliberately not in the dose log), and AS_NEEDED_COMPOUNDS. The AI prompts' schedule prose is
// generated from all three (protocolSchedule in ./protocolProse.ts), so the notes on each entry
// are prompt text: pronoun-free, and written to say how to read the data, not just what changed.
//
// Shared because both sides score against the rules: the adherence panel and calendar rings in
// the app (app/utils/adherence.ts), and the digest prompts on the server, which precompute "what
// was due today / this week, what was logged" (tallySchedule) so the model never has to work
// out weekdays from dates itself — it was guessing at them before.
//
// As-needed compounds (BPC-157) deliberately have no rule — sporadic logging is the plan, not
// a lapse. `from` dates come from the dose log's first day of each cadence. NOTE: this
// describes the real protocol only; the demo persona's dose dates re-anchor nightly and drift
// across weekdays, so adherence UI is hidden for demo sessions.
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

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

// doseLabel is the current dose, which is what the app displays. A dose change appends a step to
// `doses` and updates doseLabel to match; the row keeps its `from`. Steps come from the dose log
// (a dose held four days or more; one-off doses and two-day dips are left out).
export const PROTOCOL_RULES: ProtocolRule[] = [
  {
    compound: 'Testosterone Cypionate', doseLabel: '75 mg', weekdays: [1, 4], from: '2026-06-18', injected: true,
    doses: [
      { from: '2026-06-18', label: '50 mg' },
      { from: '2026-06-22', label: '100 mg' },
      { from: '2026-08-24', label: '75 mg' }
    ]
  },
  {
    compound: 'hCG', doseLabel: '300 IU', weekdays: [0, 2, 5], from: '2026-06-18', injected: true,
    doses: [
      { from: '2026-06-18', label: '250 IU' },
      { from: '2026-07-14', label: '500 IU' },
      { from: '2026-07-21', label: '250 IU' },
      { from: '2026-09-08', label: '300 IU' }
    ]
  },
  {
    compound: 'HGH', doseLabel: '2.5 IU', weekdays: EVERY_DAY, from: '2026-06-13', injected: true,
    doses: [
      { from: '2026-06-13', label: '1 IU' },
      { from: '2026-06-20', label: '1.5 IU' },
      { from: '2026-07-02', label: '2 IU' },
      { from: '2026-07-17', label: '2.25 IU' },
      { from: '2026-07-22', label: '1.5 IU' },
      { from: '2026-08-11', label: '2 IU' },
      { from: '2026-09-03', label: '2.5 IU' }
    ]
  },
  // `to` is inclusive, so the rings stop expecting a dose from 2026-09-02 on.
  {
    compound: 'GHK-Cu', doseLabel: '2 mg', weekdays: EVERY_DAY, from: '2026-02-01', to: '2026-09-01', injected: true,
    stopNote: 'the vial finished and another is not being reconstituted for the time being'
  },
  { compound: 'Finasteride', doseLabel: '1 mg', weekdays: EVERY_DAY, from: '2026-07-29' }
]

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

const TADALAFIL_SINCE = 'daily-protocol Cialis, taken each morning for endothelial/BP support since about June 2025'
const TADALAFIL_BP = 'Its mild BP-lowering effect is standing context when interpreting blood-pressure trends'

// Daily meds running since before the dose log existed — too routine to log per-day, but real
// protocol. Rendered as extra rows on the calendar's protocol timeline (not stored in D1), and
// named in the prompts' schedule so their absence from the dose log never reads as a miss.
export const STANDING_COMPOUNDS: StandingCompound[] = [
  { compound: 'Tadalafil', from: '2025-06-01', to: '2026-06-01', label: '7 mg gummy', note: `${TADALAFIL_SINCE}. ${TADALAFIL_BP}` },
  { compound: 'Tadalafil', from: '2026-06-02', to: null, label: '5 mg tablet', note: `${TADALAFIL_SINCE}; 7 mg gummies until 2026-06-01, 5 mg tablets since. ${TADALAFIL_BP}` }
]

/** Taken when something calls for it, so gaps in the log are the plan. No rule, no rings. */
export const AS_NEEDED_COMPOUNDS: Array<{ compound: string, note: string }> = [
  { compound: 'BPC-157', note: 'for soreness/tightness' }
]

export function ruleActiveOn(rule: ProtocolRule, date: string): boolean {
  return date >= rule.from && (rule.to == null || date <= rule.to)
}

/** In force on `date`, and `date`'s weekday is one the rule calls for. */
export function ruleDueOn(rule: ProtocolRule, date: string): boolean {
  return ruleActiveOn(rule, date) && rule.weekdays.includes(weekdayOf(date))
}

/** Rules whose cadence calls for a dose on this date. */
export function scheduledFor(date: string, rules: ProtocolRule[] = PROTOCOL_RULES): ProtocolRule[] {
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
