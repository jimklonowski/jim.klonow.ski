// Dated marker goals (audit #43 item 60): the targets a draw is read against, as rows — and the
// verdict each gets from the draws on file. A threshold goal ("estradiol under 100") is judged
// on the latest usable reading; a trend goal ("hematocrit seen falling") on the latest reading
// against the one before it, and only once a draw has landed after the goal was stated — a
// trend needs new evidence, a threshold does not. A reading is unusable when it is a bound at
// the assay's limit (censored) or when a medication on the protocol is known to move that
// marker (confounded — isotretinoin's lipids and liver enzymes decide nothing about Primobolan).
// Goals linked to a cycle roll up to GO / NO-GO / UNDECIDED for that cycle. Pure; the pages and
// the prompts both read these.
//
// A reading the hematocrit page itself would not trust decides nothing either (audit #44 item
// 16): a red-cell marker read inside the turnover window after a dose change cannot show that
// change yet, and a CBC or ferritin read within weeks of a phlebotomy shows the blood taken out.
// The verdict used to know neither — the page tagged the reading "transitional" while the goal
// beside it said NOT MET and the cycle rolled up to NO-GO. Such a reading is TOO EARLY, and the
// verdict names the first day a draw would be a clean one.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { firstCleanDay, readingTags, type Phlebotomy, type TransitionalWindow } from './hematocrit.ts'
import { isCensored, type NotedDraw } from './labNotes.ts'

export type GoalComparator = 'below' | 'at_most' | 'above' | 'at_least' | 'falling' | 'rising'

/** A marker_goals row (migration 0020). */
export interface MarkerGoal {
  id: number
  /** Biomarker key (app/data/biomarkers.ts). */
  marker: string
  comparator: GoalComparator
  /** The threshold, in the marker's unit; null for a trend goal. */
  target: number | null
  /** When it should hold by; null for no deadline. */
  by_date: string | null
  /** The cycle it gates, if one. */
  cycle_id: number | null
  /** The day the goal was set. */
  stated: string
  note: string | null
  created_at: string
}

export const GOAL_COMPARATORS: ReadonlyArray<{ value: GoalComparator, label: string, trend: boolean }> = [
  { value: 'below', label: 'under', trend: false },
  { value: 'at_most', label: 'at or under', trend: false },
  { value: 'above', label: 'over', trend: false },
  { value: 'at_least', label: 'at or over', trend: false },
  { value: 'falling', label: 'seen falling', trend: true },
  { value: 'rising', label: 'seen rising', trend: true }
]

export function isTrendGoal(comparator: GoalComparator): boolean {
  return comparator === 'falling' || comparator === 'rising'
}

export type GoalStatus = 'met' | 'not-met' | 'insufficient' | 'confounded' | 'too-early'

export interface GoalReading {
  date: string
  value: number
}

export interface GoalVerdict {
  goal: MarkerGoal
  status: GoalStatus
  /** The reading the verdict rests on, when there is one. */
  latest: GoalReading | null
  /** For a trend goal, the reading before `latest`. */
  previous: GoalReading | null
  /** The compound that confounds `latest`, when the status is confounded. */
  confoundedBy: string | null
  /**
   * The first day a new draw of this marker would be a clean read, when that is still ahead of
   * `asOf` (a turnover window is open, or a phlebotomy is recent); null when a draw today would
   * be one, and for markers neither rule touches.
   */
  cleanFrom: string | null
  /** One line of why, for the chip title and the prompt. */
  reason: string
}

/** What a verdict reads besides the draws. Every part is optional: absent, it rules nothing out. */
export interface GoalEvidence {
  /** The protocol compound that skews this marker on a date, or null (caveatCompoundOn over the
   * marker caveats and the protocol spans). */
  confoundedBy?: (date: string) => string | null
  /** The turnover windows after each dose change of an erythropoietic compound (transitionalWindows). */
  windows?: readonly TransitionalWindow[]
  /** The phlebotomy log. */
  phlebotomies?: readonly Phlebotomy[]
}

/** A draw as the verdict reads it: its date, its markers and its per-reading notes. */
export interface GoalDraw extends NotedDraw {
  date: string
  markers: Record<string, number | null | undefined>
}

const fmt = (v: number) => Number(v.toFixed(1)).toString()

/** Every usable reading of the marker on or before `asOf`, oldest first: numeric, uncensored. */
export function goalReadings(goal: Pick<MarkerGoal, 'marker'>, draws: readonly GoalDraw[], asOf: string): GoalReading[] {
  return draws
    .filter(d => d.date <= asOf && d.markers[goal.marker] != null && Number.isFinite(d.markers[goal.marker]) && !isCensored(d, goal.marker))
    .map(d => ({ date: d.date, value: d.markers[goal.marker] as number }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function holds(comparator: GoalComparator, value: number, target: number): boolean {
  switch (comparator) {
    case 'below': return value < target
    case 'at_most': return value <= target
    case 'above': return value > target
    case 'at_least': return value >= target
    default: return false
  }
}

/**
 * The goal's verdict as of `asOf`, read against `evidence` (see GoalEvidence; with none, only a
 * censored reading is set aside).
 *
 * The order of the checks is the order of what a reading can be: absent; drawn on a medication
 * that moves the marker (CONFOUNDED); for a trend, older than the goal (nothing new to judge);
 * tagged transitional or post-phlebotomy by the hematocrit rules (TOO EARLY); and only then
 * compared. A verdict that is not MET also says when the next clean read is possible, if that
 * is not yet — so a NOT MET resting on a reading from before a dose cut reads as "not yet".
 */
export function goalVerdict(goal: MarkerGoal, draws: readonly GoalDraw[], asOf: string, evidence: GoalEvidence = {}): GoalVerdict {
  const windows = evidence.windows ?? []
  const phlebotomies = evidence.phlebotomies ?? []
  const tagsOn = (date: string) => readingTags(goal.marker, date, windows, phlebotomies)
  const clean = firstCleanDay(goal.marker, asOf, windows, phlebotomies)
  const cleanFrom = clean > asOf ? clean : null
  const waitNote = cleanFrom ? ` — next clean read from ${cleanFrom}` : ''

  const readings = goalReadings(goal, draws, asOf)
  const latest = readings.at(-1) ?? null
  const base = { goal, latest, previous: null as GoalReading | null, confoundedBy: null as string | null, cleanFrom }
  const pastDue = goal.by_date != null && asOf > goal.by_date
  const dueNote = pastDue ? ` — past the ${goal.by_date} date` : ''

  if (!latest) return { ...base, status: 'insufficient', reason: `no usable reading on file${dueNote}${waitNote}` }
  const compound = evidence.confoundedBy?.(latest.date) ?? null
  if (compound) return { ...base, status: 'confounded', confoundedBy: compound, reason: `${fmt(latest.value)} on ${latest.date} was drawn on ${compound}, which moves this marker — it decides nothing` }

  const trend = isTrendGoal(goal.comparator)
  if (trend && latest.date < goal.stated) return { ...base, status: 'insufficient', reason: `no draw since the goal was set on ${goal.stated}${dueNote}${waitNote}` }

  const tags = tagsOn(latest.date)
  if (tags.length) {
    const next = cleanFrom ? `first clean read from ${cleanFrom}` : 'a draw from today on is a clean read'
    return { ...base, status: 'too-early', reason: `${fmt(latest.value)} on ${latest.date}: ${tags.map(t => t.text).join('; ')} — it decides nothing; ${next}` }
  }

  if (trend) {
    // The reading to compare with is the last one that shows where the protocol had the marker:
    // one taken in the weeks after a phlebotomy sits in the hole the visit made, and a "rise"
    // from it is only the blood coming back. A transitional reading is a true level, and stays.
    const previous = readings.slice(0, -1).findLast(r => !tagsOn(r.date).some(t => t.kind === 'post-phlebotomy')) ?? null
    if (!previous) return { ...base, status: 'insufficient', reason: `only one reading (${fmt(latest.value)} on ${latest.date}); a trend needs two${dueNote}${waitNote}` }
    const delta = latest.value - previous.value
    const met = goal.comparator === 'falling' ? delta < 0 : delta > 0
    const move = delta === 0 ? 'flat' : `${delta > 0 ? '+' : ''}${fmt(delta)}`
    return { ...base, previous, status: met ? 'met' : 'not-met', reason: `${fmt(previous.value)} on ${previous.date} → ${fmt(latest.value)} on ${latest.date} (${move})${met ? '' : `${dueNote}${waitNote}`}` }
  }

  if (goal.target == null) return { ...base, status: 'insufficient', reason: 'the goal has no target to compare with' }
  const met = holds(goal.comparator, latest.value, goal.target)
  return { ...base, status: met ? 'met' : 'not-met', reason: `${fmt(latest.value)} on ${latest.date} against ${comparatorLabel(goal.comparator)} ${fmt(goal.target)}${met ? '' : `${dueNote}${waitNote}`}` }
}

export function comparatorLabel(comparator: GoalComparator): string {
  return GOAL_COMPARATORS.find(c => c.value === comparator)?.label ?? comparator
}

/** "Hematocrit seen falling" / "Estradiol under 100 pg/mL by 2027-03-01". */
export function goalLabel(goal: Pick<MarkerGoal, 'marker' | 'comparator' | 'target' | 'by_date'>, meta?: { label?: string, unit?: string } | null): string {
  const name = meta?.label ?? goal.marker
  const target = isTrendGoal(goal.comparator) || goal.target == null ? '' : ` ${fmt(goal.target)}${meta?.unit ? ` ${meta.unit}` : ''}`
  return `${name} ${comparatorLabel(goal.comparator)}${target}${goal.by_date ? ` by ${goal.by_date}` : ''}`
}

/** The goals that bear on a cycle: its own, plus the standing ones (no cycle) that gate everything. */
export function goalsForCycle(goals: readonly MarkerGoal[], cycleId: number | null | undefined): MarkerGoal[] {
  return goals.filter(g => g.cycle_id == null || (cycleId != null && g.cycle_id === cycleId))
}

export type CycleGoalVerdict = 'go' | 'no-go' | 'undecided'

export interface CycleGoalSummary {
  verdict: CycleGoalVerdict
  met: number
  notMet: number
  /** Insufficient, confounded or too early. */
  open: number
  total: number
}

/**
 * The roll-up: GO when every goal is met (and there is at least one), NO-GO when any is not met,
 * UNDECIDED otherwise — a goal with no usable reading yet, a confounded one, or one whose latest
 * reading came too early to show anything, decides nothing either way.
 */
export function cycleGoalSummary(verdicts: readonly GoalVerdict[]): CycleGoalSummary {
  const met = verdicts.filter(v => v.status === 'met').length
  const notMet = verdicts.filter(v => v.status === 'not-met').length
  const open = verdicts.length - met - notMet
  const verdict: CycleGoalVerdict = notMet ? 'no-go' : verdicts.length && met === verdicts.length ? 'go' : 'undecided'
  return { verdict, met, notMet, open, total: verdicts.length }
}

export const STATUS_WORD: Record<GoalStatus, string> = { 'met': 'MET', 'not-met': 'NOT MET', 'insufficient': 'INSUFFICIENT', 'confounded': 'CONFOUNDED', 'too-early': 'TOO EARLY' }
export const VERDICT_WORD: Record<CycleGoalVerdict, string> = { 'go': 'GO', 'no-go': 'NO-GO', 'undecided': 'UNDECIDED' }

/** "- Hematocrit seen falling: NOT MET — 51.7 on … → 51.7 on … (flat)", for the prompts. */
export function goalLine(v: GoalVerdict, meta?: { label?: string, unit?: string } | null): string {
  return `- ${goalLabel(v.goal, meta)}: ${STATUS_WORD[v.status]} — ${v.reason}${v.goal.note ? ` (${v.goal.note})` : ''}`
}
