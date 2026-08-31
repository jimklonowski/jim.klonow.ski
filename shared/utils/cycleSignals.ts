// Passive side-effect signals for a planned cycle — the deliberate replacement for a symptom
// tracker. Jim detects sides through data, not sensation (the "+15 lbs means water retention"
// lesson), and scheduled self-report logging never sticks, so every signal here derives from
// streams that collect themselves: hand-logged vitals (weight/BP) and watch/Whoop metrics
// (RHR/HRV/recovery/sleep). Nothing to press, ever.
//
// Model: each metric's average over the last two weeks of the cycle-so-far is compared against
// its average over the four weeks before the start. Noise thresholds are the same per-metric
// values the digest trend engine uses (server/utils/trends.ts) so "flagged here" and "trend
// there" never disagree about what counts as real. Weight additionally gets a rate check —
// fast gain is the water-retention tell long before the total looks alarming.
//
// Shared (app + server): the cycle dossier and home strip render these, and cycleContext
// (server/utils/protocol.ts) folds flagged ones into the AI prompts.

import type { Cycle } from './cycles'
import { cycleEnd, cycleStatusOn, shiftDays } from './cycles'

/** Structural shapes of journal_entries / health_metrics rows — the app types and raw D1 rows
 * both satisfy them. */
export interface SignalJournalRow {
  date: string
  weight_lbs?: number | null
  bp_systolic?: number | null
  rhr?: number | null
  hrv?: number | null
}
export interface SignalHealthRow {
  date: string
  recovery_score?: number | null
  sleep_total_min?: number | null
}

export type SignalState = 'no-data' | 'baseline' | 'steady' | 'watch' | 'flagged'

export interface CycleSignal {
  key: 'weight' | 'bp_systolic' | 'rhr' | 'hrv' | 'recovery' | 'sleep'
  label: string
  unit: string
  decimals: number
  /** Average over the 4 weeks before the start; null when too sparse. */
  baseline: number | null
  /** Average over the last 2 weeks of the cycle-so-far; null when too sparse or pre-start. */
  current: number | null
  delta: number | null
  /** Weight only: change per week across the current window — the water-retention tell. */
  ratePerWeek: number | null
  state: SignalState
  /** The move is in the direction worth worrying about on-cycle (weight counts as watch-worthy
   * in both directions — gaining is partly the goal, so it flags but isn't called adverse). */
  adverse: boolean
  /** Chronological values across [start−28d, cycle-so-far] for a sparkline. */
  spark: number[]
  /** Index in spark of the first on-cycle value (boundary marker), or -1. */
  sparkStartIdx: number
}

interface MetricDef {
  key: CycleSignal['key']
  label: string
  unit: string
  /** Same noise floors as server/utils/trends.ts METRICS — keep the two in sync. */
  threshold: number
  decimals: number
  /** Which direction reads as adverse while on compounds. */
  adverseDir: 'up' | 'down' | 'either'
}

const METRICS: MetricDef[] = [
  { key: 'weight', label: 'Weight', unit: 'lbs', threshold: 2.5, decimals: 1, adverseDir: 'either' },
  { key: 'bp_systolic', label: 'Systolic BP', unit: 'mmHg', threshold: 6, decimals: 0, adverseDir: 'up' },
  { key: 'rhr', label: 'Resting HR', unit: 'bpm', threshold: 4, decimals: 0, adverseDir: 'up' },
  { key: 'hrv', label: 'HRV', unit: 'ms', threshold: 7, decimals: 0, adverseDir: 'down' },
  { key: 'recovery', label: 'Recovery', unit: '%', threshold: 8, decimals: 0, adverseDir: 'down' },
  { key: 'sleep', label: 'Sleep', unit: 'min', threshold: 30, decimals: 0, adverseDir: 'down' }
]

const BASELINE_DAYS = 28
const CURRENT_DAYS = 14
/** Same floor as trends.ts MIN_POINTS — fewer readings than this is an anecdote, not a window. */
const MIN_POINTS = 4
/** Sustained weight change this fast escalates regardless of the level delta. */
const RATE_WATCH_LBS_WK = 1.5
const RATE_FLAG_LBS_WK = 2.5

interface Point { date: string, value: number }

function pick<T extends { date: string }>(rows: T[], get: (r: T) => number | null | undefined): Point[] {
  return rows
    .flatMap((r) => {
      const value = get(r)
      return value != null && Number.isFinite(value) ? [{ date: r.date, value }] : []
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

function avg(points: Point[], from: string, to: string): number | null {
  const vals = points.filter(p => p.date >= from && p.date <= to)
  return vals.length >= MIN_POINTS ? vals.reduce((s, p) => s + p.value, 0) / vals.length : null
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp

export function computeCycleSignals(
  cycle: Cycle,
  today: string,
  journal: SignalJournalRow[],
  health: SignalHealthRow[]
): CycleSignal[] {
  const start = cycle.start_date
  const status = cycleStatusOn(cycle, today)
  const asOf = cycleEnd(cycle) < today ? cycleEnd(cycle) : today

  const baseFrom = shiftDays(start, -BASELINE_DAYS)
  const baseTo = shiftDays(start, -1)
  const curFrom = shiftDays(asOf, -(CURRENT_DAYS - 1))

  const seriesByKey: Record<CycleSignal['key'], Point[]> = {
    weight: pick(journal, r => r.weight_lbs),
    bp_systolic: pick(journal, r => r.bp_systolic),
    rhr: pick(journal, r => r.rhr),
    hrv: pick(journal, r => r.hrv),
    recovery: pick(health, r => r.recovery_score),
    sleep: pick(health, r => r.sleep_total_min)
  }

  return METRICS.map((m) => {
    const points = seriesByKey[m.key]
    const baseline = avg(points, baseFrom, baseTo)

    const sparkPoints = points.filter(p => p.date >= baseFrom && p.date <= asOf)
    const spark = sparkPoints.map(p => p.value)
    const sparkStartIdx = sparkPoints.findIndex(p => p.date >= start)

    if (status === 'upcoming') {
      return {
        key: m.key, label: m.label, unit: m.unit, decimals: m.decimals,
        baseline: baseline != null ? round(baseline, m.decimals) : null,
        current: null, delta: null, ratePerWeek: null,
        state: baseline != null ? 'baseline' as const : 'no-data' as const,
        adverse: false, spark, sparkStartIdx
      }
    }

    const current = avg(points, curFrom > start ? curFrom : start, asOf)

    // Weight rate: last week of the window vs the week before it, so two weeks of steady
    // climb read as lbs/week even when the 4-week baseline hasn't moved much yet.
    let ratePerWeek: number | null = null
    if (m.key === 'weight') {
      const lastWk = avg(points, shiftDays(asOf, -6), asOf)
      const priorWk = avg(points, shiftDays(asOf, -13), shiftDays(asOf, -7))
      if (lastWk != null && priorWk != null) ratePerWeek = round(lastWk - priorWk, 1)
    }

    if (baseline == null || current == null) {
      return {
        key: m.key, label: m.label, unit: m.unit, decimals: m.decimals,
        baseline: baseline != null ? round(baseline, m.decimals) : null,
        current: current != null ? round(current, m.decimals) : null,
        delta: null, ratePerWeek, state: 'no-data' as const, adverse: false, spark, sparkStartIdx
      }
    }

    const delta = current - baseline
    const magnitude = Math.abs(delta) / m.threshold
    let state: SignalState = magnitude >= 2 ? 'flagged' : magnitude >= 1 ? 'watch' : 'steady'
    if (m.key === 'weight' && ratePerWeek != null) {
      const rate = Math.abs(ratePerWeek)
      if (rate >= RATE_FLAG_LBS_WK) state = 'flagged'
      else if (rate >= RATE_WATCH_LBS_WK && state === 'steady') state = 'watch'
    }

    const adverse = state !== 'steady' && (
      m.adverseDir === 'either' || (m.adverseDir === 'up' ? delta > 0 : delta < 0)
    )
    // A clear move in the GOOD direction (HRV up, RHR down…) is news, not a worry — cap it
    // at watch so the flag styling stays reserved for problems.
    if (!adverse && state === 'flagged') state = 'watch'

    return {
      key: m.key, label: m.label, unit: m.unit, decimals: m.decimals,
      baseline: round(baseline, m.decimals),
      current: round(current, m.decimals),
      delta: round(delta, m.decimals),
      ratePerWeek,
      state, adverse, spark, sparkStartIdx
    }
  })
}

/** Signals worth surfacing outside the dossier (home strip, AI prompts): watch or flagged. */
export function activeSignals(signals: CycleSignal[]): CycleSignal[] {
  const rank = { flagged: 0, watch: 1 } as Record<SignalState, number>
  return signals
    .filter(s => s.state === 'flagged' || s.state === 'watch')
    .sort((a, b) => (rank[a.state] ?? 9) - (rank[b.state] ?? 9))
}

/** "weight +4.2 lbs" / "HRV −9 ms" — shared shorthand for strip lines and prompt text. */
export function signalShorthand(s: CycleSignal): string {
  const sign = (s.delta ?? 0) > 0 ? '+' : ''
  return `${s.label} ${sign}${s.delta} ${s.unit}`
}
