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
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
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

export type GoalStatus = 'met' | 'not-met' | 'insufficient' | 'confounded'

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
  /** One line of why, for the chip title and the prompt. */
  reason: string
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
 * The goal's verdict as of `asOf`. `confoundedBy(date)` names the protocol compound that skews
 * this marker on that date, or null (caveatCompoundOn over the marker caveats and the protocol
 * spans); omitted, nothing confounds.
 */
export function goalVerdict(goal: MarkerGoal, draws: readonly GoalDraw[], asOf: string, confoundedBy: (date: string) => string | null = () => null): GoalVerdict {
  const readings = goalReadings(goal, draws, asOf)
  const latest = readings.at(-1) ?? null
  const base = { goal, latest, previous: null as GoalReading | null, confoundedBy: null as string | null }
  const pastDue = goal.by_date != null && asOf > goal.by_date
  const dueNote = pastDue ? ` — past the ${goal.by_date} date` : ''

  if (!latest) return { ...base, status: 'insufficient', reason: `no usable reading on file${dueNote}` }
  const compound = confoundedBy(latest.date)
  if (compound) return { ...base, status: 'confounded', confoundedBy: compound, reason: `${fmt(latest.value)} on ${latest.date} was drawn on ${compound}, which moves this marker — it decides nothing` }

  if (isTrendGoal(goal.comparator)) {
    if (latest.date < goal.stated) return { ...base, status: 'insufficient', reason: `no draw since the goal was set on ${goal.stated}${dueNote}` }
    const previous = readings.at(-2) ?? null
    if (!previous) return { ...base, status: 'insufficient', reason: `only one reading (${fmt(latest.value)} on ${latest.date}); a trend needs two${dueNote}` }
    const delta = latest.value - previous.value
    const met = goal.comparator === 'falling' ? delta < 0 : delta > 0
    const move = delta === 0 ? 'flat' : `${delta > 0 ? '+' : ''}${fmt(delta)}`
    return { ...base, previous, status: met ? 'met' : 'not-met', reason: `${fmt(previous.value)} on ${previous.date} → ${fmt(latest.value)} on ${latest.date} (${move})${met ? '' : dueNote}` }
  }

  if (goal.target == null) return { ...base, status: 'insufficient', reason: 'the goal has no target to compare with' }
  const met = holds(goal.comparator, latest.value, goal.target)
  return { ...base, status: met ? 'met' : 'not-met', reason: `${fmt(latest.value)} on ${latest.date} against ${comparatorLabel(goal.comparator)} ${fmt(goal.target)}${met ? '' : dueNote}` }
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
  /** Insufficient or confounded. */
  open: number
  total: number
}

/**
 * The roll-up: GO when every goal is met (and there is at least one), NO-GO when any is not met,
 * UNDECIDED otherwise — a goal with no usable reading yet, or a confounded one, decides nothing
 * either way.
 */
export function cycleGoalSummary(verdicts: readonly GoalVerdict[]): CycleGoalSummary {
  const met = verdicts.filter(v => v.status === 'met').length
  const notMet = verdicts.filter(v => v.status === 'not-met').length
  const open = verdicts.length - met - notMet
  const verdict: CycleGoalVerdict = notMet ? 'no-go' : verdicts.length && met === verdicts.length ? 'go' : 'undecided'
  return { verdict, met, notMet, open, total: verdicts.length }
}

export const STATUS_WORD: Record<GoalStatus, string> = { 'met': 'MET', 'not-met': 'NOT MET', 'insufficient': 'INSUFFICIENT', 'confounded': 'CONFOUNDED' }
export const VERDICT_WORD: Record<CycleGoalVerdict, string> = { 'go': 'GO', 'no-go': 'NO-GO', 'undecided': 'UNDECIDED' }

/** "- Hematocrit seen falling: NOT MET — 51.7 on … → 51.7 on … (flat)", for the prompts. */
export function goalLine(v: GoalVerdict, meta?: { label?: string, unit?: string } | null): string {
  return `- ${goalLabel(v.goal, meta)}: ${STATUS_WORD[v.status]} — ${v.reason}${v.goal.note ? ` (${v.goal.note})` : ''}`
}
