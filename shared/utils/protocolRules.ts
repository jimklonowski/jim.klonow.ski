// The intended weekly cadence of the standing protocol, as data: which compounds are due on
// which weekdays, and since when. Hand-maintained, like its prose twin PROTOCOL_SCHEDULE in
// server/utils/protocol.ts (which carries the intent and nuance the AI prompts read) and
// STANDING_COMPOUNDS in app/data/journal.ts — keep the three in sync when the protocol changes.
//
// Shared because both sides score against it: the adherence panel and calendar rings in the
// app (app/utils/adherence.ts), and the digest prompts on the server, which precompute "what
// was due today / this week, what was logged" (tallySchedule) so the model never has to work
// out weekdays from dates itself — it was guessing at them before.
//
// As-needed compounds (BPC-157) deliberately have no rule — sporadic logging is the plan, not
// a lapse. `from` dates come from the dose log's first day of each cadence. NOTE: this
// describes the real protocol only; the demo persona's dose dates re-anchor nightly and drift
// across weekdays, so adherence UI is hidden for demo sessions.
//
// Keep this module free of runtime imports: tests load it under Node's native type stripping,
// which can't resolve extension-less relative paths.

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
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

export const PROTOCOL_RULES: ProtocolRule[] = [
  { compound: 'Testosterone Cypionate', doseLabel: '75 mg', weekdays: [1, 4], from: '2026-06-18' },
  // 300 IU since 2026-09-08 (250 IU before that); doseLabel is display-only so the row keeps its from.
  { compound: 'hCG', doseLabel: '300 IU', weekdays: [0, 2, 5], from: '2026-06-18' },
  // 2.5 IU since 2026-09-03 (2 IU before, 2.25 IU on 09-02/03 while stepping up).
  { compound: 'HGH', doseLabel: '2.5 IU', weekdays: EVERY_DAY, from: '2026-06-13' },
  // Discontinued 2026-09-01 (vial finished, not reconstituting another for now). `to` is
  // inclusive, so the rings stop expecting a dose from 2026-09-02 on.
  { compound: 'GHK-Cu', doseLabel: '2 mg', weekdays: EVERY_DAY, from: '2026-02-01', to: '2026-09-01' },
  { compound: 'Finasteride', doseLabel: '1 mg', weekdays: EVERY_DAY, from: '2026-07-29' }
]

/** 0=Sun … 6=Sat for a YYYY-MM-DD string. Noon-local anchoring keeps it timezone-proof. */
export function weekdayOf(date: string): number {
  return new Date(date + 'T12:00:00').getDay()
}

function nextDay(date: string): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-CA')
}

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
    d = nextDay(d)
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
    for (let d = start; d <= end && d <= today; d = nextDay(d)) {
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
