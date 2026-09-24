// The protocol-timeline gantt: which compounds ran when, as bars across week or month slots,
// with lab draws and a "now" line underneath. The compounds page and the calendar both draw it.
// Each used to carry its own ~130-line copy of this math, identical apart from variable names.
//
// Pure data in, bar geometry out (percentages of the track width), so it's shared and tested
// (tests/timeline.test.mjs). The component that renders it is app/components/journal/ProtocolTimeline.vue.

// Explicit .ts: runtime imports the plain-node test runner must resolve without Vite.
import { eachDay, weekStartOf } from './dates.ts'

export type TimelineZoom = 'week' | 'month'

/** One contiguous stretch on a row, as a slice of the track. */
export interface GanttRun {
  /** % from the track's left edge. */
  left: number
  /** % of the track width. */
  width: number
  /** Hover text: what ran, and between which slots or dates. */
  title: string
}

export interface GanttRow {
  name: string
  runs: GanttRun[]
  /** Slots with any activity: the "12w" / "5mo" figure at the row's end. */
  count: number
}

/** A daily med that predates the dose log (STANDING_COMPOUNDS in ./protocolRules.ts). */
export interface StandingRange {
  compound: string
  from: string
  /** Inclusive; null while ongoing. */
  to: string | null
  label: string
}

export interface TimelineInput {
  /** Journal rows; only `date` and each dose's `compound` are read. */
  entries: Array<{ date: string, peptides?: Array<{ compound: string }> | null }>
  standing: StandingRange[]
  labDates: string[]
  /** First day on the timeline. */
  from: string
  today: string
  zoom: TimelineZoom
}

export interface Timeline {
  slots: string[]
  /** Standing meds first (they predate the log), then logged compounds by first use. */
  rows: GanttRow[]
  /** How many of `rows` are standing meds, so a collapsed preview can always keep them. */
  standingCount: number
  labMarks: Array<{ slot: string, left: number, title: string }>
  /** % position of the end of the current slot, or null when today is off the axis. */
  nowLeft: number | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Sep 14" / "Sep 14, 2026", straight from the date string (no Date, so no zone). */
function fmt(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return withYear ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`
}

/** The slot a date falls in: its week's Sunday, or its YYYY-MM month. */
export function slotKeyOf(date: string, zoom: TimelineZoom): string {
  return zoom === 'week' ? weekStartOf(date) : date.slice(0, 7)
}

/** Every slot from the one containing `from` through the one containing `to`. */
export function timelineSlots(from: string, to: string, zoom: TimelineZoom): string[] {
  if (from > to) return []
  if (zoom === 'week') return eachDay(weekStartOf(from), weekStartOf(to), 7)
  const out: string[] = []
  let [y, m] = from.split('-').map(Number) as [number, number]
  const [ey, em] = to.split('-').map(Number) as [number, number]
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) {
      m = 1
      y++
    }
  }
  return out
}

/** "Sep 26" (month + 2-digit year) for a month slot, "week of Sep 14" for a week slot. */
export function slotLabel(slot: string, zoom: TimelineZoom): string {
  if (zoom === 'month') {
    const [y, m] = slot.split('-').map(Number) as [number, number]
    return `${MONTHS[m - 1]} ${String(y).slice(2)}`
  }
  return `week of ${fmt(slot)}`
}

/** Contiguous active slots become one bar, so a compound that ran Feb–Apr reads as a single
 * duration rather than a row of disconnected ticks. */
export function toRuns(slots: string[], active: Set<string>, name: string, zoom: TimelineZoom): GanttRun[] {
  if (!slots.length) return []
  const unit = 100 / slots.length
  const runs: GanttRun[] = []
  let start = -1
  for (let i = 0; i <= slots.length; i++) {
    const on = i < slots.length && active.has(slots[i]!)
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      runs.push({
        left: start * unit,
        width: (i - start) * unit,
        title: `${name} · ${slotLabel(slots[start]!, zoom)} → ${slotLabel(slots[i - 1]!, zoom)}`
      })
      start = -1
    }
  }
  return runs
}

export function buildTimeline({ entries, standing, labDates, from, today, zoom }: TimelineInput): Timeline {
  const slots = timelineSlots(from, today, zoom)
  if (!slots.length) return { slots, rows: [], standingCount: 0, labMarks: [], nowLeft: null }
  const unit = 100 / slots.length
  const indexOf = new Map(slots.map((s, i) => [s, i]))

  // Logged compounds, ordered by first use.
  const bySlot = new Map<string, Set<string>>()
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = slotKeyOf(e.date, zoom)
    for (const p of e.peptides ?? []) {
      if (!p.compound) continue
      let set = bySlot.get(p.compound)
      if (!set) bySlot.set(p.compound, set = new Set())
      set.add(key)
    }
  }
  const logged: GanttRow[] = [...bySlot].map(([name, active]) => ({
    name, runs: toRuns(slots, active, name, zoom), count: active.size
  }))

  // Standing meds: date ranges → bars clamped to the axis, since they never hit the dose log.
  // `covered` is a set because adjacent ranges (a dose-form switch mid-week) can put their
  // boundary in the same slot, and counting per range would tally that slot twice.
  const standingRows = new Map<string, { runs: GanttRun[], covered: Set<number> }>()
  for (const s of standing) {
    const end = s.to != null && s.to < today ? s.to : today
    const endKey = slotKeyOf(end, zoom)
    if (endKey < slots[0]! || s.from > today) continue // entirely off the axis
    const startIdx = indexOf.get(slotKeyOf(s.from, zoom)) ?? 0
    const endIdx = indexOf.get(endKey) ?? slots.length - 1
    let row = standingRows.get(s.compound)
    if (!row) standingRows.set(s.compound, row = { runs: [], covered: new Set() })
    for (let i = startIdx; i <= endIdx; i++) row.covered.add(i)
    row.runs.push({
      left: startIdx * unit,
      width: (endIdx - startIdx + 1) * unit,
      title: `${s.compound} ${s.label} · ${fmt(s.from, true)} → ${s.to ? fmt(s.to, true) : 'now'}`
    })
  }
  const standingList: GanttRow[] = [...standingRows].map(([name, r]) => ({ name, runs: r.runs, count: r.covered.size }))

  // Lab draws: one ▲ per slot, centred, listing every draw in it.
  const labsBySlot = new Map<string, string[]>()
  for (const date of [...labDates].sort()) {
    const key = slotKeyOf(date, zoom)
    if (!indexOf.has(key)) continue
    labsBySlot.set(key, [...(labsBySlot.get(key) ?? []), date])
  }
  const labMarks = [...labsBySlot].map(([slot, dates]) => ({
    slot,
    left: (indexOf.get(slot)! + 0.5) * unit,
    title: `lab draw · ${dates.map(d => fmt(d, true)).join(', ')}`
  }))

  const nowIdx = indexOf.get(slotKeyOf(today, zoom))
  return {
    slots,
    rows: [...standingList, ...logged],
    standingCount: standingList.length,
    labMarks,
    nowLeft: nowIdx == null ? null : (nowIdx + 1) * unit
  }
}
