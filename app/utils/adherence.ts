// Planned-vs-logged scoring for the PROTOCOL_RULES cadence — fully passive: everything is
// derived from the dose log at read time, nothing new to enter. Weekday intent drives the
// calendar's rings, but the weekly score counts dose-DAYS against the week's expected count,
// so a shot slid from Monday to Tuesday still scores — the plan is a cadence, not a contract
// with the calendar.

import type { JournalEntry, ProtocolRule } from '~/data/journal'
import { PROTOCOL_RULES } from '~/data/journal'

const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function weekdayOf(date: string): number {
  return new Date(date + 'T12:00:00').getDay()
}

function shiftDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

/** Sunday that starts the week containing `date` — matches the calendar grid. */
function weekStartOf(date: string): string {
  return shiftDays(date, -weekdayOf(date))
}

function ruleActiveOn(rule: ProtocolRule, date: string): boolean {
  return date >= rule.from && (rule.to == null || date <= rule.to)
}

/** Rules whose cadence calls for a dose on this date. */
export function scheduledFor(date: string, rules: ProtocolRule[] = PROTOCOL_RULES): ProtocolRule[] {
  const wd = weekdayOf(date)
  return rules.filter(r => ruleActiveOn(r, date) && r.weekdays.includes(wd))
}

/** "DAILY" / "MON+THU" — Monday-first, since that's how a week reads. */
export function cadenceLabel(rule: ProtocolRule): string {
  if (rule.weekdays.length === 7) return 'DAILY'
  return [...rule.weekdays]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map(d => DAY_SHORT[d])
    .join('+')
}

export interface AdherenceWeek {
  weekStart: string
  expected: number
  actual: number
  /** The running week — rendered differently since it can't be complete yet. */
  partial: boolean
}

export interface AdherenceRow {
  compound: string
  doseLabel: string
  cadence: string
  /** Oldest first, ending on the current (partial) week. */
  weeks: AdherenceWeek[]
  /** Hits are capped per week, so extra doses can't paper over a missed week. Null until a
   * rule has had at least one expected day inside the window. */
  pct: number | null
  status: { kind: 'done' | 'due' | 'overdue' | 'next', label: string }
}

function statusOf(rule: ProtocolRule, logged: Set<string>, today: string): AdherenceRow['status'] {
  const dueToday = ruleActiveOn(rule, today) && rule.weekdays.includes(weekdayOf(today))
  if (dueToday && logged.has(today)) return { kind: 'done', label: '✓ TODAY' }

  // A scheduled day counts as covered if any dose landed on or after it — slid, not skipped.
  let lastScheduled: string | null = null
  for (let i = 1; i <= 7; i++) {
    const d = shiftDays(today, -i)
    if (ruleActiveOn(rule, d) && rule.weekdays.includes(weekdayOf(d))) {
      lastScheduled = d
      break
    }
  }
  if (lastScheduled) {
    let covered = false
    for (let d = lastScheduled; d <= today; d = shiftDays(d, 1)) {
      if (logged.has(d)) {
        covered = true
        break
      }
    }
    if (!covered) {
      return dueToday
        ? { kind: 'overdue', label: 'DUE TODAY' }
        : { kind: 'overdue', label: `${DAY_SHORT[weekdayOf(lastScheduled)]} MISSED` }
    }
  }
  if (dueToday) return { kind: 'due', label: 'DUE TODAY' }
  for (let i = 1; i <= 7; i++) {
    const d = shiftDays(today, i)
    if (ruleActiveOn(rule, d) && rule.weekdays.includes(weekdayOf(d))) {
      return { kind: 'next', label: `NEXT ${DAY_SHORT[weekdayOf(d)]}` }
    }
  }
  return { kind: 'next', label: '—' }
}

export function computeAdherence(
  entries: JournalEntry[],
  today: string,
  weeksBack = 8,
  rules: ProtocolRule[] = PROTOCOL_RULES
): AdherenceRow[] {
  const doseDates = new Map<string, Set<string>>()
  for (const e of entries) {
    for (const p of e.peptides ?? []) {
      if (!p.compound) continue
      let set = doseDates.get(p.compound)
      if (!set) doseDates.set(p.compound, set = new Set())
      set.add(e.date)
    }
  }

  const currentWeek = weekStartOf(today)
  const weekStarts = Array.from({ length: weeksBack }, (_, i) => shiftDays(currentWeek, -7 * (weeksBack - 1 - i)))

  return rules
    .filter(r => ruleActiveOn(r, today))
    .map((rule) => {
      const logged = doseDates.get(rule.compound) ?? new Set<string>()
      const weeks: AdherenceWeek[] = weekStarts.map((weekStart) => {
        let expected = 0
        let actual = 0
        for (let i = 0; i < 7; i++) {
          const d = shiftDays(weekStart, i)
          if (d > today || !ruleActiveOn(rule, d)) continue
          if (logged.has(d)) actual++
          // Today isn't a miss while it can still be dosed — it counts once logged.
          if (rule.weekdays.includes(weekdayOf(d)) && (d < today || logged.has(d))) expected++
        }
        return { weekStart, expected, actual, partial: weekStart === currentWeek }
      })
      const totals = weeks.reduce(
        (t, w) => ({ exp: t.exp + w.expected, hit: t.hit + Math.min(w.actual, w.expected) }),
        { exp: 0, hit: 0 }
      )
      return {
        compound: rule.compound,
        doseLabel: rule.doseLabel,
        cadence: cadenceLabel(rule),
        weeks,
        pct: totals.exp ? Math.round((totals.hit / totals.exp) * 100) : null,
        status: statusOf(rule, logged, today)
      }
    })
}
