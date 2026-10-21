import { shiftDays } from './dates.ts'
import { HOME_TZ } from './time.ts'

// The demo seed (scripts/demo/demo-seed.json) carries RELATIVE dates so the sandbox always reads
// as recent: "@D<n>" is n days before the anchor (yesterday as a Chicago calendar day; negative
// n looks forward, for vial expiries), and a time-with-offset field may end in "@Z", the home
// zone's UTC offset for THAT day. Both materializers — scripts/demo/seed-demo.mjs and
// server/tasks/demo/reset.ts — call this, so they cannot drift (audit #42 item 12: the script
// subtracted n × 24 h in milliseconds, which across a DST change puts two offsets on one
// calendar day — a primary-key clash mid-seed, after the wipe — and the generator stamped every
// workout with a fixed -0500, an hour early all winter). Plain TS: node imports it directly.

export const OFFSET_RE = /^@D(-?\d+)(.*)$/
export const ZONE_TOKEN = '@Z'

export interface SeedTable {
  cols: string[]
  jsonCols: string[]
  rows: unknown[][]
}

const partsFmt = new Map<string, Intl.DateTimeFormat>()
function wallClockParts(tz: string) {
  let fmt = partsFmt.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    partsFmt.set(tz, fmt)
  }
  return fmt
}

/** Minutes east of UTC that `tz` is at the instant `utcMs` (Chicago: -300 in summer, -360 in winter). */
function offsetMinutesAt(utcMs: number, tz: string): number {
  const parts = wallClockParts(tz).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return Math.round((asUtc - utcMs) / 60_000)
}

/** The `±HHMM` UTC offset of `tz` at the wall-clock `time` (HH:MM[:SS]) on `date` (YYYY-MM-DD). */
export function zoneOffsetAt(date: string, time: string, tz = HOME_TZ): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
  const [h, mi, s = 0] = time.split(':').map(Number) as [number, number, number?]
  const wall = Date.UTC(y, mo - 1, d, h, mi, s)
  // The offset at the instant whose UTC clock reads the wall time is a first guess; re-reading it
  // at the instant that guess implies settles the hours around a DST change.
  const guess = offsetMinutesAt(wall, tz)
  const offset = offsetMinutesAt(wall - guess * 60_000, tz)
  const abs = Math.abs(offset)
  return `${offset < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`
}

const TIME_RE = /\b(\d{2}:\d{2}(?::\d{2})?)\b/

/** "@D<n>rest" → (anchor − n days) + rest, "@Z" in rest becoming that day's offset; anything else as it is. */
export function materializeSeedValue(value: unknown, anchor: string): unknown {
  if (typeof value !== 'string') return value
  const m = OFFSET_RE.exec(value)
  if (!m) return value
  const date = shiftDays(anchor, -Number(m[1]))
  let rest = m[2] ?? ''
  if (rest.includes(ZONE_TOKEN)) {
    rest = rest.replaceAll(ZONE_TOKEN, zoneOffsetAt(date, TIME_RE.exec(rest)?.[1] ?? '12:00:00'))
  }
  return date + rest
}

/** A seed table's rows as the INSERT binds them: JSON columns stringified, relative dates materialized. */
export function materializeSeedRows(table: SeedTable, anchor: string): unknown[][] {
  const jsonCols = new Set(table.jsonCols.map(c => table.cols.indexOf(c)))
  return table.rows.map(row => row.map((v, i) => (jsonCols.has(i) ? JSON.stringify(v) : materializeSeedValue(v, anchor))))
}
