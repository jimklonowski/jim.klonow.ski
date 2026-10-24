// The protocol tables (protocol_items + protocol_versions, migration 0013) mapped back to the
// shapes everything scores and narrates with: ProtocolRule rows for 'logged' items, StandingCompound
// rows for standing meds, the as-needed list, and supplements-table rows for the stack paragraphs.
// Pure — the D1 reads are the loader's job (the protocol plan, P4) — and proven lossless against the
// code constants it replaces by tests/protocolStore.test.mjs (P10): same data, same prompt prose on
// every date, same chart annotations, same due list day by day.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { shiftDays } from './dates.ts'
import type { AsNeededCompound, DoseStep, ProtocolRule, StandingCompound } from './protocolRules.ts'
import type { SupplementRow } from './supplementProse.ts'

/** A protocol_items row as D1 returns it. */
export interface ProtocolItemRow {
  id: number
  name: string
  /** 'logged' | 'standing' | 'as_needed' — anything else is left out, not guessed at. */
  kind: string
  /** 'injectable' | 'oral' | 'supplement' | 'skin' */
  category: string
  injected: number
  on_hand: number
  notes: string | null
  stop_note: string | null
  sort: number
}

/** A protocol_versions row as D1 returns it. */
export interface ProtocolVersionRow {
  id: number
  item_id: number
  from_date: string | null
  to_date: string | null
  dose_label: string | null
  /** JSON array of 0–6, or NULL for no fixed days. */
  weekdays: string | null
  note: string | null
}

export interface ProtocolData {
  /** Weekday-scheduled and scored against the dose log: PROTOCOL_RULES' shape, one row per cadence run. */
  rules: ProtocolRule[]
  /** Standing meds of category oral/injectable, never logged: STANDING_COMPOUNDS' shape, one row per dated range. */
  standing: StandingCompound[]
  asNeeded: AsNeededCompound[]
  /** Standing items of category supplement/skin, as the supplements-table rows the stack prose reads. */
  supplements: Array<SupplementRow & { sort: number }>
}

/** Where a request's protocol came from: the tables; the code constants (a database before 0013,
 * or before `protocol:seed`); or nothing — the demo sandbox has no schedule of its own yet (P9),
 * and the owner's constants must never stand in for it. */
export type ProtocolSource = 'tables' | 'constants' | 'none'

export interface LoadedProtocol extends ProtocolData {
  /** Surfaced for the cutover check and the demo rule, never for behaviour. */
  source: ProtocolSource
}

export const EMPTY_PROTOCOL: LoadedProtocol = { rules: [], standing: [], asNeeded: [], supplements: [], source: 'none' }

/** Stands in for an unknown start (a NULL from_date): before any record, so the date math stays
 * total and the calendar timeline clamps it away. */
export const BEFORE_RECORDS = '1970-01-01'

const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6]

/** The weekday set a version stores, or null for none / malformed JSON. */
export function parseWeekdays(json: string | null): number[] | null {
  if (json == null) return null
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return null
    return [...new Set(parsed.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))]
  }
  catch {
    return null
  }
}

function sameDays(a: number[] | null, b: number[] | null): boolean {
  if (a == null || b == null || a.length !== b.length) return false
  const sb = [...b].sort((x, y) => x - y)
  return [...a].sort((x, y) => x - y).every((d, i) => d === sb[i])
}

// Versions in date order; an unknown start sorts first.
const byFrom = (a: ProtocolVersionRow, b: ProtocolVersionRow) => (a.from_date ?? '').localeCompare(b.from_date ?? '')

/**
 * One rule per cadence run. Versions that start the day after the previous one ended, on the
 * same weekdays, are one rule and its dose steps; a gap is a stop and a restart, and a weekday
 * change is the two-row handover that predecessorOf/successorOf already read as one compound
 * changing. The item's stop note belongs to its last run, and only once that run has ended.
 */
function rulesOf(item: ProtocolItemRow, versions: ProtocolVersionRow[]): ProtocolRule[] {
  const runs: ProtocolVersionRow[][] = []
  for (const v of versions) {
    const run = runs.at(-1)
    const prev = run?.at(-1)
    const continues = prev != null && prev.to_date != null && v.from_date != null
      && shiftDays(prev.to_date, 1) === v.from_date
      && sameDays(parseWeekdays(prev.weekdays), parseWeekdays(v.weekdays))
    if (continues) run!.push(v)
    else runs.push([v])
  }
  return runs.map((run, i) => {
    const first = run[0]!
    const last = run.at(-1)!
    const rule: ProtocolRule = {
      compound: item.name,
      doseLabel: last.dose_label ?? '',
      // A logged version without weekdays reads as daily, the common case for a logged compound;
      // the save-time schema (P7) requires them, so this is a fallback, not a convention.
      weekdays: parseWeekdays(first.weekdays) ?? ALL_WEEK,
      from: first.from_date ?? BEFORE_RECORDS
    }
    if (last.to_date != null) rule.to = last.to_date
    if (item.injected) rule.injected = true
    if (run.length > 1) rule.doses = run.map((v): DoseStep => ({ from: v.from_date ?? BEFORE_RECORDS, label: v.dose_label ?? '' }))
    if (last.note) rule.note = last.note
    if (i === runs.length - 1 && last.to_date != null && item.stop_note) rule.stopNote = item.stop_note
    return rule
  })
}

function standingOf(item: ProtocolItemRow, versions: ProtocolVersionRow[]): StandingCompound[] {
  return versions.map((v) => {
    const s: StandingCompound = { compound: item.name, from: v.from_date ?? BEFORE_RECORDS, to: v.to_date, label: v.dose_label ?? '' }
    if (v.note) s.note = v.note
    return s
  })
}

// The three spellings migration 0013 mapped to weekday sets, so the copy round-trips exactly.
const SCHEDULE_SPELLINGS: Array<[number[], string]> = [[ALL_WEEK, 'daily'], [[1, 4], 'Mondays + Thursdays'], [[0], 'Sundays']]
const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

/** The schedule as the supplements table spelled it: a known spelling, long-form weekday names
 * otherwise (Monday-first), and the version's note when the schedule was freeform text. */
export function scheduleText(v: ProtocolVersionRow | null): string {
  const days = parseWeekdays(v?.weekdays ?? null)
  if (days == null) return v?.note ?? 'daily'
  const known = SCHEDULE_SPELLINGS.find(([set]) => sameDays(set, days))
  if (known) return known[1]
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAY_PLURAL[d]).join(' + ')
}

function supplementOf(item: ProtocolItemRow, versions: ProtocolVersionRow[]): SupplementRow & { sort: number } {
  // The open version, else the last one: what is (or was last) being taken.
  const current = versions.find(v => v.to_date == null) ?? versions.at(-1) ?? null
  const status = item.on_hand ? 'on_hand' : current != null && current.to_date == null ? 'active' : 'stopped'
  return {
    name: item.name,
    dose: current?.dose_label ?? null,
    category: item.category === 'skin' ? 'skin' : 'supplement',
    status,
    schedule: scheduleText(current),
    started: versions[0]?.from_date ?? null,
    stopped: status === 'stopped' ? (current?.to_date ?? null) : null,
    notes: item.notes,
    sort: item.sort
  }
}

/**
 * Items (any order) and versions (any order) → the four shapes. Items come out by sort then
 * name, versions by date, so the result is stable whatever the SQL ordered by. A standing item
 * splits on category: an oral or injectable med is a standing compound (the calendar timeline
 * row and the "Every day: … deliberately NOT in the dose log" prose line); a supplement or skin
 * item is part of the stack paragraphs.
 */
export function protocolFromRows(items: ProtocolItemRow[], versions: ProtocolVersionRow[]): ProtocolData {
  const byItem = new Map<number, ProtocolVersionRow[]>()
  for (const v of versions) {
    let list = byItem.get(v.item_id)
    if (!list) byItem.set(v.item_id, list = [])
    list.push(v)
  }
  for (const list of byItem.values()) list.sort(byFrom)

  const out: ProtocolData = { rules: [], standing: [], asNeeded: [], supplements: [] }
  for (const item of [...items].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))) {
    const vs = byItem.get(item.id) ?? []
    if (item.kind === 'logged') out.rules.push(...rulesOf(item, vs))
    else if (item.kind === 'as_needed') out.asNeeded.push({ compound: item.name, note: item.notes ?? '' })
    else if (item.kind === 'standing' && (item.category === 'supplement' || item.category === 'skin')) out.supplements.push(supplementOf(item, vs))
    else if (item.kind === 'standing') out.standing.push(...standingOf(item, vs))
  }
  return out
}
