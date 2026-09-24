// The protocol as AI-prompt prose: the intended schedule every digest, lab summary, and chat
// prompt carries (protocolSchedule), and the digest's planned-vs-logged lines (scheduleContext).
// Generated from the data in ./protocolRules.ts, so the prompts can't drift from the rules that
// the adherence panel and calendar rings score against — they used to be a hand-kept prose twin.
// Written pronoun-free so it drops into prompts that refer to the reader as "he" or "they".
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { diffDays, weekdayOf } from './dates.ts'
import type { ProtocolRule, ScheduleTally, StandingCompound } from './protocolRules.ts'
import {
  AS_NEEDED_COMPOUNDS, PROTOCOL_RULES, STANDING_COMPOUNDS, nextDueDay, ruleActiveOn, tallySchedule
} from './protocolRules.ts'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Monday-first, since that's how a week reads. */
function mondayFirst(weekdays: number[]): number[] {
  return [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
}

/** 'daily' or 'Mon+Thu'. */
export function cadenceOf(weekdays: number[]): string {
  if (weekdays.length === 7) return 'daily'
  return mondayFirst(weekdays).map(d => DAY_NAMES[d]).join('+')
}

/** "Wed Sep 9" — every date the digest prompts show carries its weekday, because the schedule
 * is expressed in weekdays and the model should never have to derive one from a date. */
export function fmtDay(d: string): string {
  const monthDay = new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${DAY_NAMES[weekdayOf(d)]} ${monthDay}`
}

/** "A, B, and C" */
function joinAnd(items: string[]): string {
  if (items.length <= 2) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

// How long a stopped rule stays in the prompts' schedule — the same ~4-month window the
// supplement stack uses for "recently discontinued".
const DISCONTINUED_RELEVANCE_DAYS = 120

// "150 mg/week" for a non-daily rule whose label is a plain amount; null otherwise.
function weeklyTotal(rule: ProtocolRule): string | null {
  const m = /^([\d.]+)\s*(.+)$/.exec(rule.doseLabel)
  if (!m || rule.weekdays.length === 7) return null
  return `${Number(m[1]) * rule.weekdays.length} ${m[2]}/week`
}

function ruleLine(rule: ProtocolRule): string {
  const days = rule.weekdays.length === 7 ? 'Every day' : mondayFirst(rule.weekdays).map(d => DAY_NAMES_LONG[d]).join(' + ')
  const perInjection = rule.injected && rule.weekdays.length < 7
  const weekly = perInjection ? weeklyTotal(rule) : null
  const detail = [weekly, rule.note].filter(Boolean).join(' — ')
  return `- ${days}: ${rule.compound} ${rule.doseLabel}${perInjection ? ' per injection' : ''}${detail ? ` (${detail})` : ''}.`
}

function standingLine(s: StandingCompound): string {
  return `- Every day: ${s.compound} ${s.label}${s.note ? ` — ${s.note}` : ''}. It is deliberately NOT in the dose log, so never read its absence there as a missed dose.`
}

/**
 * The intended dosing schedule as it stood on `asOf`: rules and standing meds in force that
 * day, the as-needed list, and rules stopped within the last few months (so a gap in the log
 * reads as the plan). asOf matters because lab summaries regenerate for historical draws.
 * Doses are the current ones — a rule's `note` carries its history.
 */
export function protocolSchedule(
  asOf: string,
  rules: ProtocolRule[] = PROTOCOL_RULES,
  standing: StandingCompound[] = STANDING_COMPOUNDS
): string {
  const active = rules.filter(r => ruleActiveOn(r, asOf))
  const stopped = rules.filter(r => r.to != null && r.to < asOf && diffDays(r.to, asOf) <= DISCONTINUED_RELEVANCE_DAYS)
  const injectables = active.filter(r => r.injected).map(r => r.compound)

  const lines = [
    ...active.map(ruleLine),
    ...standing.filter(s => s.from <= asOf && (s.to == null || s.to >= asOf)).map(standingLine)
  ]
  if (injectables.length) {
    lines.push(`- ${joinAnd(injectables)} ${injectables.length === 1 ? 'is the only injectable' : 'are the only injectables'} currently running.`)
  }
  for (const a of AS_NEEDED_COMPOUNDS) {
    lines.push(`- ${a.compound} is as-needed only (${a.note}), so sporadic logging is expected, not a lapse.`)
  }
  for (const r of stopped) {
    lines.push(`- ${r.compound} ${r.doseLabel} ${cadenceOf(r.weekdays)} ran until ${r.to} and is now discontinued${r.stopNote ? ` — ${r.stopNote}` : ''}. Its absence from the dose log since then is deliberate, never a missed dose.`)
  }
  return `Intended dosing schedule (the reference for adherence — journal dose logs should line up with this; call out deviations, don't re-announce matches):\n${lines.join('\n')}`
}

// --- schedule check (planned vs logged) ---

// The digest prompts used to hand the model "Recap for Sep 9" plus a weekday-based schedule and
// let it work out that Sep 9 was a Wednesday. It guessed. These lines resolve the weekday math
// deterministically — what was due, what was logged, what was missed, what is still open — so
// the model narrates numbers instead of computing them, the same way the trend and cycle-signal
// context already works.

/** "Sun Sep 6, Mon Sep 7 and Tue Sep 8" */
function listDays(dates: string[]): string {
  const days = dates.map(fmtDay)
  return days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} and ${days.at(-1)}`
}

function dailyScheduleLine(date: string, tallies: ScheduleTally[], today: string): string {
  const open = date >= today
  const due = tallies.filter(t => t.hit.length || t.missed.length || t.pending)
  const logged = due.filter(t => t.hit.length)
  const unlogged = due.filter(t => !t.hit.length)
  const notDue = tallies.filter(t => !due.includes(t) && ruleActiveOn(t.rule, date))
  const off = tallies.filter(t => t.offSchedule.length)
  const names = (list: ScheduleTally[]) => list.map(t => t.rule.compound).join(', ')

  const parts = [
    `Schedule check for ${fmtDay(date)}, against the intended schedule above with any planned cycle layered in — due today: ${due.length ? due.map(t => `${t.rule.compound} ${t.rule.doseLabel} (${cadenceOf(t.rule.weekdays)})`).join(', ') : 'nothing'}.`
  ]
  if (logged.length) parts.push(`Logged: ${names(logged)}.`)
  if (unlogged.length) {
    parts.push(open
      ? `Not yet logged: ${names(unlogged)} — this recap is being written while the day is still under way (Chicago time), so treat that as open, not missed.`
      : `Missed (due, never logged): ${names(unlogged)}.`)
  }
  if (notDue.length) {
    parts.push(`Not due today: ${notDue.map((t) => {
      const next = nextDueDay(t.rule, date)
      return `${t.rule.compound} (${cadenceOf(t.rule.weekdays)}${next ? `; next ${fmtDay(next)}` : ''})`
    }).join(', ')}.`)
  }
  if (off.length) parts.push(`Off-schedule today: ${names(off)} — not one of its days, so an extra or a slid dose.`)
  return parts.join(' ')
}

function weeklyScheduleLines(start: string, end: string, tallies: ScheduleTally[], today: string): string {
  const rows = tallies.filter(t => t.hit.length || t.missed.length || t.pending || t.offSchedule.length)
  if (!rows.length) return ''
  const open = end >= today
  const lines = rows.map((t) => {
    const dueDates = [...t.hit, ...t.missed].sort()
    const daily = t.rule.weekdays.length === 7
    const window = t.rule.to != null && t.rule.to < end
      ? `, schedule ended ${fmtDay(t.rule.to)}`
      : t.rule.from > start ? `, schedule began ${fmtDay(t.rule.from)}` : ''
    let line = `- ${t.rule.compound} ${t.rule.doseLabel} (${cadenceOf(t.rule.weekdays)}${window}): `
    line += dueDates.length
      ? `${daily ? `${dueDates.length} days due` : `due ${listDays(dueDates)}`} — ${t.hit.length} logged`
      : 'nothing due'
    if (t.missed.length) line += `; missed ${listDays(t.missed)}`
    if (t.pending) line += `; due today (${fmtDay(t.pending)}), not yet logged`
    if (t.offSchedule.length) line += `; off-schedule dose${t.offSchedule.length > 1 ? 's' : ''} ${listDays(t.offSchedule)}`
    return line + '.'
  })
  const header = `Schedule check for ${fmtDay(start)} – ${fmtDay(end)}, against the intended schedule above with any planned cycle layered in (a missed day followed within a day or two by an off-schedule dose is a slid dose, not a lapse${open ? '; the week is still under way, so days after today are not counted and today only counts once logged' : ''}):`
  return [header, ...lines].join('\n')
}

// Planned-vs-logged for the digest period as prompt fact lines: one sentence for a single day,
// a header plus one line per compound for a week. `rules` is the effective schedule (standing
// rules with any planned cycle merged in); `doseDates` maps compound → logged dates; `today` is
// the home-timezone date, so a same-day regenerate reads "not yet logged" rather than "missed".
// Returns '' when no rule is in force in the window.
export function scheduleContext(
  rules: ProtocolRule[],
  start: string,
  end: string,
  doseDates: Map<string, Set<string>>,
  today: string
): string {
  const tallies = tallySchedule(rules, start, end, doseDates, today)
  if (!tallies.length) return ''
  return start === end
    ? dailyScheduleLine(start, tallies, today)
    : weeklyScheduleLines(start, end, tallies, today)
}
