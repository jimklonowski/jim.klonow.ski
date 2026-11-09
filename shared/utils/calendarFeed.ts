// The calendar feed (audit #43 item 58): every dated thing the site expects of its owner, as
// all-day events a phone's calendar can subscribe to — planned draws with the evening-before
// alarm and their prep days, cycle checkpoint windows, the isotretinoin course's dated rungs,
// booster due dates and the CBC six weeks after a phlebotomy. Titles are deliberately generic
// ("Lab draw", "Cycle checkpoint", "Booster due", "Course: …"): a subscribed calendar syncs on
// to whatever services the phone shares calendars with, so no compound or vaccine name goes in
// a SUMMARY — the detail lives in the DESCRIPTION. UIDs are stable per thing, so a re-sync
// updates an event instead of duplicating it. Pure: the route loads, this derives and renders.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import {
  ISOTRETINOIN, RECHECK_WINDOW_DAYS, baselineDrawDate, courseDoses, courseLadder, courseStats, isotretinoinCycle,
  plannedMgPerDay, recheckDraw
} from './accutane.ts'
import { checkpointStates, cycleEnd, cycleStatusOn, isTentative, type Cycle } from './cycles.ts'
import { shiftDays } from './dates.ts'
import { PHLEBOTOMY_RETEST_DAYS, type Phlebotomy } from './hematocrit.ts'
import { drawLabel, plannedDrawStates, prepReminders, purposeLines, type PlannedDraw } from './plannedDraws.ts'
import { vaccineCoverage, type Vaccination } from './vaccines.ts'

/** One all-day event. `end` is exclusive, iCalendar's convention; omitted means one day. */
export interface CalendarEvent {
  uid: string
  start: string
  end?: string
  summary: string
  description?: string
  /** A display alarm: an RFC 5545 duration relative to the start ("-PT4H" = 20:00 the evening
   * before, "PT9H" = 09:00 that morning) and the text it shows. */
  alarm?: { trigger: string, text: string }
}

/** A lab draw as the feed reads it: blood draws only (echo-only rows already removed). */
export interface CalendarLabDraw {
  date: string
  markers: Record<string, number | null | undefined>
}

/** A journal row as the feed reads it: the weigh-in and the dose log the course needs. */
export interface CalendarJournalRow {
  date: string
  weight_lbs?: number | null
  peptides?: ReadonlyArray<{ compound: string, dose: number | null | undefined, unit?: string | null }> | null
}

export interface CalendarInputs {
  plans: readonly PlannedDraw[]
  labs: readonly CalendarLabDraw[]
  cycles: readonly Cycle[]
  vaccinations: readonly Vaccination[]
  phlebotomies: readonly Phlebotomy[]
  journal: readonly CalendarJournalRow[]
}

/** The evening-before alarm for a draw (20:00 on an all-day event's eve) and the morning alarm
 * for everything else (09:00 that day). */
export const DRAW_EVE_ALARM = '-PT4H'
export const MORNING_ALARM = 'PT9H'

const byStart = (a: CalendarEvent, b: CalendarEvent) => a.start.localeCompare(b.start) || a.summary.localeCompare(b.summary)

/**
 * Every event the record calls for as of `today`. Past events are left out except a planned
 * draw past its date with no results (still pending, so still on the calendar).
 */
export function calendarEvents(inputs: CalendarInputs, today: string, uidDomain: string): CalendarEvent[] {
  const uid = (kind: string, key: string | number) => `${kind}-${key}@${uidDomain}`
  const out: CalendarEvent[] = []
  const labDates = inputs.labs.map(d => d.date)

  // --- planned draws and their prep days ---
  const states = plannedDrawStates([...inputs.plans], labDates, today)
  for (const s of states) {
    if (s.status === 'done' || s.status === 'missed') continue
    const { plan } = s
    const dayOf = prepReminders(plan, today).filter(r => r.from === plan.date).map(r => r.text)
    const lines = [drawLabel(plan), ...purposeLines(plan), ...dayOf]
    out.push({
      uid: uid('draw', plan.id),
      start: plan.date,
      summary: s.status === 'overdue' ? 'Lab draw (no results yet)' : 'Lab draw',
      description: lines.join('\n'),
      alarm: s.status === 'overdue'
        ? undefined
        : { trigger: DRAW_EVE_ALARM, text: plan.fasting ? 'Lab draw tomorrow: fast from 20:00, water only; no hard training' : 'Lab draw tomorrow: no hard training' }
    })
    // The days before: one event per prep day still ahead, the day's reminders folded together.
    const ahead = prepReminders(plan, today).filter(r => r.from < plan.date && r.from >= today)
    const byDay = new Map<string, typeof ahead>()
    for (const r of ahead) byDay.set(r.from, [...(byDay.get(r.from) ?? []), r])
    for (const [date, rs] of byDay) {
      out.push({
        uid: uid('draw-prep', `${plan.id}-${date}`),
        start: date,
        summary: `Draw prep: ${rs.map(r => r.short).join(' · ')}`,
        description: rs.map(r => r.text).join('\n'),
        alarm: { trigger: MORNING_ALARM, text: `Draw prep starts today: ${rs.map(r => r.short).join(', ')}` }
      })
    }
  }

  // --- cycles: start, end and checkpoint windows (never a tentative plan's) ---
  for (const c of inputs.cycles) {
    if (isTentative(c) || c.id == null) continue
    const status = cycleStatusOn(c, today)
    if (status === 'done') continue
    const isCourse = c.compounds.some(i => i.compound === ISOTRETINOIN)
    // The course's own rungs date its start and end below; other cycles get a start and an end.
    if (!isCourse) {
      if (c.start_date >= today) out.push({ uid: uid('cycle-start', c.id), start: c.start_date, summary: 'Cycle starts', description: c.name, alarm: { trigger: MORNING_ALARM, text: 'Cycle starts today' } })
      const end = cycleEnd(c)
      if (end >= today) out.push({ uid: uid('cycle-end', c.id), start: end, summary: 'Cycle ends', description: c.name })
    }
    for (const cp of checkpointStates(c, labDates, today)) {
      if (cp.state !== 'upcoming' && cp.state !== 'due') continue
      const from = cp.windowFrom < today ? today : cp.windowFrom
      out.push({
        uid: uid('cycle-cp', `${c.id}-${cp.key}`),
        start: from,
        end: shiftDays(cp.windowTo, 1),
        summary: `Cycle checkpoint: ${cp.label}`,
        description: `${c.name} — the window for the ${cp.label}`,
        alarm: { trigger: MORNING_ALARM, text: `Cycle checkpoint window opens: ${cp.label}` }
      })
    }
  }

  // --- the isotretinoin course's dated rungs ---
  const course = isotretinoinCycle(inputs.cycles, today)
  if (course && course.id != null) {
    const weight = [...inputs.journal].filter(e => e.weight_lbs != null).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.weight_lbs ?? null
    const stats = courseStats(course, courseDoses(inputs.journal), weight, today, plannedMgPerDay(course))
    const planStates = states.filter(s => s.plan.cycle_id === course.id || s.plan.cycle_id == null).map(s => ({ date: s.plan.date, status: s.status }))
    const recheck = recheckDraw(inputs.labs, planStates, course.start_date)
    const rungs = courseLadder(stats, today, baselineDrawDate(inputs.labs, course.start_date), recheck)
    const SUMMARIES: Record<string, string> = {
      start: 'Course starts',
      lower: 'Course: lower target reached (projected)',
      upper: 'Course: upper target reached (projected)',
      end: 'Course: last capsule (planned)',
      donation: 'Course: blood donation OK again',
      procedures: 'Course: wax and laser OK again'
    }
    for (const r of rungs) {
      if (r.tier !== 'course' || r.state === 'done' || r.state === 'missed' || !r.date || r.date < today) continue
      const summary = SUMMARIES[r.key]
      // The recheck is a planned draw's event when one is booked; unbooked, its window is below.
      if (!summary) continue
      out.push({ uid: uid('course', `${course.id}-${r.key}`), start: r.date, summary, description: `${r.label}: ${r.detail}`, alarm: { trigger: MORNING_ALARM, text: summary } })
    }
    if (!recheck) {
      const from = shiftDays(course.start_date, RECHECK_WINDOW_DAYS.from)
      const to = shiftDays(course.start_date, RECHECK_WINDOW_DAYS.to)
      if (to >= today) {
        out.push({
          uid: uid('course', `${course.id}-recheck-window`),
          start: from < today ? today : from,
          end: shiftDays(to, 1),
          summary: 'Course: first recheck window',
          description: 'Book lipids, liver, CBC and CK — the lipid and liver moves show by weeks 4–8',
          alarm: { trigger: MORNING_ALARM, text: 'Course recheck window opens: book the draw' }
        })
      }
    }
  }

  // --- boosters ---
  for (const v of vaccineCoverage([...inputs.vaccinations], today)) {
    if (!v.nextDue || v.nextDue < today) continue
    out.push({
      uid: uid('booster', v.family.replace(/[^a-z0-9]+/gi, '-').toLowerCase()),
      start: v.nextDue,
      summary: 'Booster due',
      description: `${v.label} — last dose ${v.lastDate}${v.intervalYears ? `, every ${v.intervalYears} years` : ''}`,
      alarm: { trigger: MORNING_ALARM, text: 'A booster is due' }
    })
  }

  // --- the CBC after a phlebotomy ---
  for (const p of inputs.phlebotomies) {
    const due = shiftDays(p.date, PHLEBOTOMY_RETEST_DAYS)
    if (due < today) continue
    // A CBC already on file after the visit is the retest; nothing left to book.
    if (inputs.labs.some(d => d.date > p.date && d.markers.hematocrit != null)) continue
    out.push({
      uid: uid('phleb-retest', p.id),
      start: due,
      summary: 'CBC retest',
      description: `${PHLEBOTOMY_RETEST_DAYS / 7} weeks after the ${p.date} phlebotomy — hematocrit, hemoglobin, ferritin`,
      alarm: { trigger: MORNING_ALARM, text: 'CBC retest due: six weeks since the phlebotomy' }
    })
  }

  return out.sort(byStart)
}

// --- rendering ---

const CRLF = '\r\n'
const encoder = new TextEncoder()

/** RFC 5545 text: backslash, semicolon and comma escaped, newlines as \n. */
export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** A content line folded at 75 octets, continuations led by one space (RFC 5545 §3.1). */
export function foldIcsLine(line: string): string {
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = encoder.encode(ch).length
    const limit = parts.length ? 74 : 75
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  parts.push(current)
  return parts.map((p, i) => (i ? ` ${p}` : p)).join(CRLF)
}

const dateValue = (iso: string) => iso.replace(/-/g, '')
const stampValue = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

export interface RenderOptions {
  /** The calendar's display name (X-WR-CALNAME). */
  name: string
  /** DTSTAMP for every event: when the feed was rendered. */
  now: Date
  /** How often a client should re-fetch, hours. */
  refreshHours?: number
}

/** The feed as an iCalendar document: all-day, non-blocking events with their alarms. */
export function renderIcs(events: readonly CalendarEvent[], { name, now, refreshHours = 6 }: RenderOptions): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//jim.klonow.ski//calendar feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshHours}H`,
    `X-PUBLISHED-TTL:PT${refreshHours}H`
  ]
  const stamp = stampValue(now)
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateValue(e.start)}`,
      `DTEND;VALUE=DATE:${dateValue(e.end ?? shiftDays(e.start, 1))}`,
      `SUMMARY:${escapeIcsText(e.summary)}`
    )
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`)
    // A reminder, not an appointment: it must not show the day as busy.
    lines.push('TRANSP:TRANSPARENT')
    if (e.alarm) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${e.alarm.trigger}`, `DESCRIPTION:${escapeIcsText(e.alarm.text)}`, 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join(CRLF) + CRLF
}
