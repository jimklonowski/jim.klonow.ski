// "Today" for this app is always a Chicago calendar day, on the client and on the server alike.
//
// This used to be `new Date().toLocaleDateString('en-CA')`, i.e. whatever the *runtime's* local
// timezone happened to be. On the client that's Chicago and correct; inside a Cloudflare Worker
// it's UTC, so between 7pm and midnight Central every server-rendered "today" was tomorrow's
// date. That's what made "+ NEW ENTRY" open tomorrow's entry in the evening (the SSR href) and
// made the evening status bar show tomorrow's date until hydration caught up.
//
// Pinning the zone also means a day boundary that doesn't move when Jim travels — a dose logged
// at 11pm belongs to that day's entry regardless of which timezone the phone is in.
//
// The en-CA locale is used purely because it formats as ISO YYYY-MM-DD (en-US would give
// 08/24/2026); the timeZone option does the actual conversion. Same trick as
// server/tasks/whoop/sync.ts, which hit this bug first with evening Whoop workouts.
import { shiftDays } from './dates.ts'

export const HOME_TZ = 'America/Chicago'

const isoDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: HOME_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
})

// en-GB for a 24-hour clock; h23 so midnight reads 00:xx, never 24:xx.
const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: HOME_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})

/** Today's date in the home timezone as YYYY-MM-DD. Identical on server and client. */
export function localToday(): string {
  return isoDateFmt.format(new Date())
}

/** The current wall-clock time in the home timezone as HH:MM. */
export function localTimeNow(): string {
  return clockFmt.format(new Date())
}

/** The home-timezone wall clock (HH:MM) of an instant — epoch ms or a parseable timestamp. */
export function localClockOf(instant: number | string): string {
  return clockFmt.format(new Date(instant))
}

/**
 * Epoch ms for a workout's stored start_time, or null when it can't be read. Two formats reach
 * the workouts table: Whoop writes ISO UTC ("2026-10-12T00:36:13.000Z") and Health Auto Export
 * writes local time with a numeric offset ("2026-10-11 19:36:13 -0500"). The second isn't ISO —
 * V8 parses it, WebKit doesn't — so it's rebuilt into ISO first. Both name the same instant, and
 * everything that ages, sorts, or shows a workout's clock goes through here so neither format
 * leaks (the home strip once showed a 7:36 pm ride as "1d ago · 00:36" off the Whoop copy).
 */
export function workoutStartMs(startTime: string | null | undefined): number | null {
  if (!startTime) return null
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?) ([+-]\d{2}):?(\d{2})$/.exec(startTime)
  const ms = Date.parse(m ? `${m[1]}T${m[2]}${m[3]}:${m[4]}` : startTime)
  return Number.isNaN(ms) ? null : ms
}

/**
 * The home-timezone calendar date (YYYY-MM-DD) a timestamp falls on. For "yesterday / N days
 * ago" labels: elapsed-milliseconds ÷ 86 400 000 counts hours, not calendar days, so 11:50 pm
 * last night read as "today" at 8 am.
 */
export function localDayOf(iso: string): string {
  return isoDateFmt.format(new Date(iso))
}

/**
 * A date `days` before today (home timezone), as YYYY-MM-DD. Negative values look forward.
 *
 * Calendar arithmetic on the date string, anchored at UTC noon, rather than subtracting
 * `days × 86 400 000` ms from the instant: across a DST change the ms version lands an hour
 * off, and in the hour after midnight (or before it, in the fall) that hour is a whole day.
 */
export function localDaysAgo(days: number): string {
  return shiftDays(localToday(), -days)
}

/**
 * True for a fully-typed, real calendar date in YYYY-MM-DD form. The regex alone accepts
 * 2026-13-40 — Date rolls overflow forward into the next month rather than failing — so the
 * parsed parts are compared back against the input.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const d = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(d.getTime())
    && d.getUTCMonth() + 1 === Number(m[2])
    && d.getUTCDate() === Number(m[3])
}
