// Long-horizon trend detection for the AI digests. The digests' fact sheets only cover their own
// period (a day, a week), so sustained shifts — like RHR climbing for a month after a protocol
// change — never appeared in them. This module computes those trends deterministically so the
// model narrates precomputed numbers instead of eyeballing raw data: protocol change-points are
// detected from the dose log, and each metric is compared before/after the change (or against a
// trailing baseline when no change explains it).

export interface TrendJournalRow {
  date: string
  weight_lbs: number | null
  rhr: number | null
  hrv: number | null
  bp_systolic: number | null
  peptides: Array<{ compound: string, dose?: number | null, unit?: string | null }>
}

export interface TrendHealthRow {
  date: string
  recovery_score: number | null
  sleep_total_min: number | null
}

export interface ProtocolChange {
  date: string
  // e.g. "HGH", "Testosterone Cypionate (resumed)"
  compounds: string[]
  // 'start' covers first doses and resumptions; 'stop' is a discontinuation (dose silence),
  // dated the day after the last dose so before/after windows split at the washout start;
  // 'adjust' is a sustained shift in dose size or dosing cadence of an ongoing compound
  // (e.g. daily 1.5 IU → every-other-day 2.25 IU).
  kind: 'start' | 'stop' | 'adjust'
}

export interface TrendFinding {
  key: string
  label: string
  unit: string
  recentAvg: number
  baselineAvg: number
  delta: number
  // Present when the trend is anchored to a protocol change; absent for unattributed drift.
  since?: ProtocolChange
  // The metric reversed direction at the change (washout); baselineAvg is then the 2 weeks
  // just before the change rather than the month before (a ramp dilutes the month average).
  reversal?: boolean
  // How strongly the change clears the metric's noise threshold; used for ordering.
  significance: number
}

export interface TrendsResult {
  changes: ProtocolChange[]
  findings: TrendFinding[]
}

// How far back protocol changes are considered, how long a pause must be to call a compound
// "resumed", and how many logged dose-days an event needs before it counts as a protocol
// (a one-off test injection isn't one).
const CHANGE_LOOKBACK_DAYS = 90
const RESUME_GAP_DAYS = 28
const MIN_DOSE_DAYS = 3
// A compound is considered stopped once this many days pass with no dose (long enough that a
// twice-a-week protocol's normal gaps never trip it), provided it was being dosed regularly
// before — at least MIN_DOSE_DAYS dose-days in the 28 days up to the last dose, so an
// as-needed compound doesn't generate a "stopped" event after every use.
const STOP_GAP_DAYS = 10
// A dose adjustment is a ≥40% sustained shift in average dose per injection, or a ≥40% AND
// ≥2-days-per-week shift in dosing frequency, comparing the two weeks either side of a candidate
// date. Below that it's titration noise or logging-cadence wobble (1 → 1.5 IU while ramping, or
// 4.5x/wk drifting to 3x/wk, don't need trend anchors of their own — observed on real data).
const ADJUST_REL_CHANGE = 0.4
const ADJUST_MIN_FREQ_DELTA = 2
// Events this close together are one protocol change (e.g. HGH Jun 13, TRT + hCG Jun 18).
// Stops cluster much tighter: ramping onto a stack spreads starts over weeks, but stopping
// several compounds as one decision happens within days — and merging unrelated stops shifts
// the anchor date away from the discontinuation being watched.
const CLUSTER_GAP_DAYS = 14
const STOP_CLUSTER_GAP_DAYS = 3
// Minimum data points per comparison window, and minimum days elapsed since a change before
// a before/after comparison is meaningful.
const MIN_POINTS = 4
const MIN_DAYS_SINCE_CHANGE = 7

interface MetricDef {
  key: string
  label: string
  unit: string
  threshold: number
  decimals: number
  pick: (rows: { journal: TrendJournalRow[], health: TrendHealthRow[] }) => Array<{ date: string, value: number }>
}

function series<T extends { date: string }>(rows: T[], get: (r: T) => number | null): Array<{ date: string, value: number }> {
  return rows.flatMap((r) => {
    const value = get(r)
    return value != null && !Number.isNaN(value) ? [{ date: r.date, value }] : []
  })
}

// Per-metric noise thresholds: a before/after delta below these is normal day-to-day variance,
// not a trend worth telling the user about.
const METRICS: MetricDef[] = [
  { key: 'rhr', label: 'Resting HR', unit: 'bpm', threshold: 4, decimals: 0, pick: r => series(r.journal, x => x.rhr) },
  { key: 'hrv', label: 'HRV', unit: 'ms', threshold: 7, decimals: 0, pick: r => series(r.journal, x => x.hrv) },
  { key: 'weight_lbs', label: 'Weight', unit: 'lbs', threshold: 2.5, decimals: 1, pick: r => series(r.journal, x => x.weight_lbs) },
  { key: 'bp_systolic', label: 'Systolic BP', unit: 'mmHg', threshold: 6, decimals: 0, pick: r => series(r.journal, x => x.bp_systolic) },
  { key: 'recovery_score', label: 'Whoop recovery', unit: '%', threshold: 8, decimals: 0, pick: r => series(r.health, x => x.recovery_score) },
  { key: 'sleep_total_min', label: 'Sleep', unit: 'min/night', threshold: 30, decimals: 0, pick: r => series(r.health, x => x.sleep_total_min) }
]

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86_400_000)
}

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function avgInWindow(points: Array<{ date: string, value: number }>, start: string, end: string): { avg: number, n: number } {
  const vals = points.filter(p => p.date >= start && p.date <= end).map(p => p.value)
  if (!vals.length) return { avg: 0, n: 0 }
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length }
}

interface DoseDay {
  date: string
  total: number
  unit: string | null // null when the day mixed units (can't compare dose sizes then)
}

// Detects sustained shifts in how an ongoing compound is dosed by comparing the two weeks either
// side of each dose date: dosing frequency per week, and average dose per injection (when units
// are consistent). Consecutive triggering dates describe one transition, so each ≤14-day run of
// hits collapses to its strongest point — the date the pattern actually changed.
function detectDoseAdjustments(compound: string, days: DoseDay[], endDate: string): Array<{ date: string, label: string }> {
  const first = days[0]?.date
  if (!first) return []

  const hits: Array<{ date: string, score: number, label: string }> = []
  for (const day of days) {
    // Needs two weeks of established dosing before, and at least ~a week of follow-through
    // after (a change made yesterday can't be called a pattern yet).
    if (dayDiff(day.date, first) < 14 || dayDiff(endDate, day.date) < 8) continue
    const beforeDays = days.filter(d => d.date >= addDays(day.date, -14) && d.date < day.date)
    const afterEnd = addDays(day.date, 13) < endDate ? addDays(day.date, 13) : endDate
    const afterSpan = dayDiff(afterEnd, day.date) + 1
    const afterDays = days.filter(d => d.date >= day.date && d.date <= afterEnd)
    if (beforeDays.length < 4 || afterDays.length < 2) continue

    const freqBefore = beforeDays.length / 2 // per week
    const freqAfter = afterDays.length / afterSpan * 7
    const relFreq = Math.abs(freqAfter - freqBefore) / Math.max(freqAfter, freqBefore)
    const freqShift = relFreq >= ADJUST_REL_CHANGE && Math.abs(freqAfter - freqBefore) >= ADJUST_MIN_FREQ_DELTA

    const units = new Set([...beforeDays, ...afterDays].map(d => d.unit))
    const unit = units.size === 1 ? [...units][0] : null
    const doseBefore = beforeDays.reduce((s, d) => s + d.total, 0) / beforeDays.length
    const doseAfter = afterDays.reduce((s, d) => s + d.total, 0) / afterDays.length
    const relDose = unit != null && Math.max(doseBefore, doseAfter) > 0
      ? Math.abs(doseAfter - doseBefore) / Math.max(doseBefore, doseAfter)
      : 0

    if (!freqShift && relDose < ADJUST_REL_CHANGE) continue
    const num = (n: number) => Number(n.toPrecision(3))
    const fmt = (dose: number, freq: number) => unit != null
      ? `~${num(dose)} ${unit} ${num(freq)}x/wk`
      : `${num(freq)}x/wk`
    hits.push({ date: day.date, score: Math.max(freqShift ? relFreq : 0, relDose), label: `${compound} (${fmt(doseBefore, freqBefore)} → ${fmt(doseAfter, freqAfter)})` })
  }

  // A transition trips the detector on several consecutive dose dates as the windows slide across
  // it; runs closer together than a month are one adjustment, represented by their strongest hit.
  const events: Array<{ date: string, label: string }> = []
  let group: typeof hits = []
  for (const hit of hits) {
    if (group.length && dayDiff(hit.date, group[0]!.date) > 28) {
      events.push(group.reduce((a, b) => b.score > a.score ? b : a))
      group = []
    }
    group.push(hit)
  }
  if (group.length) events.push(group.reduce((a, b) => b.score > a.score ? b : a))
  return events.filter(e => dayDiff(endDate, e.date) <= CHANGE_LOOKBACK_DAYS)
}

export function detectProtocolChanges(journal: TrendJournalRow[], endDate: string): ProtocolChange[] {
  const doseDates = new Map<string, string[]>()
  const doseDays = new Map<string, DoseDay[]>()
  for (const row of [...journal].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const p of row.peptides ?? []) {
      if (!p.compound) continue
      const dates = doseDates.get(p.compound) ?? []
      if (dates.at(-1) !== row.date) dates.push(row.date)
      doseDates.set(p.compound, dates)

      const days = doseDays.get(p.compound) ?? []
      const dose = typeof p.dose === 'number' ? p.dose : 0
      const unit = p.unit ?? null
      const last = days.at(-1)
      if (last?.date === row.date) {
        last.total += dose
        if (last.unit !== unit) last.unit = null
      }
      else {
        days.push({ date: row.date, total: dose, unit })
      }
      doseDays.set(p.compound, days)
    }
  }

  const events: Array<{ date: string, label: string, kind: ProtocolChange['kind'] }> = []
  for (const [compound, dates] of doseDates) {
    for (let i = 0; i < dates.length; i++) {
      const isStart = i === 0
      const isResume = i > 0 && dayDiff(dates[i]!, dates[i - 1]!) >= RESUME_GAP_DAYS
      if (!isStart && !isResume) continue
      const date = dates[i]!
      if (dayDiff(endDate, date) > CHANGE_LOOKBACK_DAYS || date > endDate) continue
      // Count dose-days from this event onward so a compound tried once doesn't register.
      if (dates.slice(i).filter(d => d <= endDate).length < MIN_DOSE_DAYS) continue
      events.push({ date, label: isResume ? `${compound} (resumed)` : compound, kind: 'start' })
    }

    // Discontinuation: only the final stop is detected (historical mid-series pauses already
    // surface as resumes and would otherwise add noise).
    let stopDate: string | null = null
    const lastDose = dates.filter(d => d <= endDate).at(-1)
    if (lastDose && dayDiff(endDate, lastDose) >= STOP_GAP_DAYS) {
      const candidate = addDays(lastDose, 1)
      const regularBefore = dates.filter(d => d <= lastDose && dayDiff(lastDose, d) <= 27).length >= MIN_DOSE_DAYS
      if (regularBefore && dayDiff(endDate, candidate) <= CHANGE_LOOKBACK_DAYS) {
        stopDate = candidate
        events.push({ date: candidate, label: compound, kind: 'stop' })
      }
    }

    for (const adj of detectDoseAdjustments(compound, doseDays.get(compound) ?? [], endDate)) {
      // An adjustment right before the compound's stop is the stop's shadow (the sliding window
      // sees dose silence as a frequency collapse), not a real dosing change.
      if (stopDate && dayDiff(stopDate, adj.date) <= CLUSTER_GAP_DAYS && adj.date <= stopDate) continue
      events.push({ date: adj.date, label: adj.label, kind: 'adjust' })
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date))

  const changes: ProtocolChange[] = []
  for (const e of events) {
    // Starts cluster with starts and stops with stops; a swap (one compound replacing another
    // the same week) stays two entries so each gets the right verb.
    const current = changes.filter(c => c.kind === e.kind).at(-1)
    const gap = e.kind === 'stop' ? STOP_CLUSTER_GAP_DAYS : CLUSTER_GAP_DAYS
    // Cluster gap is measured from the cluster's anchor date, which stays the earliest event so
    // metric baselines are taken from before anything in the cluster started.
    if (current && dayDiff(e.date, current.date) <= gap) current.compounds.push(e.label)
    else changes.push({ date: e.date, compounds: [e.label], kind: e.kind })
  }
  return changes.sort((a, b) => a.date.localeCompare(b.date))
}

export function computeTrends(journal: TrendJournalRow[], health: TrendHealthRow[], endDate: string): TrendsResult {
  const changes = detectProtocolChanges(journal, endDate)
  const findings: TrendFinding[] = []

  for (const metric of METRICS) {
    const points = metric.pick({ journal, health })
    if (points.length < MIN_POINTS * 2) continue

    // Anchor the metric to a protocol change only when the timing genuinely fits. Guards keep a
    // gradual ramp from being pinned on whatever change happened most recently:
    //  - a change qualifies if the metric was STABLE in the month before it (a metric already
    //    drifting before the change points at an earlier cause) — OR if the metric REVERSED
    //    direction after it, which is exactly what a washout looks like (RHR still climbing on
    //    TRT, then falling once HGH is dropped);
    //  - the metric must have MOVED within the first four weeks after the change (a change the
    //    metric ignored for a month didn't cause what came later; four weeks rather than two
    //    because slow-acting compounds ramp — observed with TRT and RHR);
    //  - the "recent" side is the last 2 weeks, not the whole post-change average, so a slow
    //    climb is reported at the level the user is actually seeing today.
    // Among qualifying changes: a REVERSAL candidate wins (most recent one if several) — a
    // direction flip is definitionally the newest inflection and describes the experiment
    // currently in flight (e.g. dropping HGH to watch RHR come back down). With no reversal,
    // the EARLIEST qualifying change wins: it is the origin of the current excursion, and later
    // changes that merely sit inside the same ramp shouldn't take credit for it.
    let stableAnchor: TrendFinding | null = null
    let reversalAnchor: TrendFinding | null = null
    for (const change of changes) {
      if (dayDiff(endDate, change.date) < MIN_DAYS_SINCE_CHANGE) continue

      const baseline = avgInWindow(points, addDays(change.date, -28), addDays(change.date, -1))
      const recentStart = addDays(endDate, -13) > change.date ? addDays(endDate, -13) : change.date
      const recent = avgInWindow(points, recentStart, endDate)
      if (baseline.n < MIN_POINTS || recent.n < MIN_POINTS) continue

      const onsetEnd = addDays(change.date, 27) < endDate ? addDays(change.date, 27) : endDate
      const onset = avgInWindow(points, change.date, onsetEnd)
      const onsetMove = onset.avg - baseline.avg
      if (onset.n < 3 || Math.abs(onsetMove) < metric.threshold / 2) continue

      const priorHalf = avgInWindow(points, addDays(change.date, -28), addDays(change.date, -15))
      const nearHalf = avgInWindow(points, addDays(change.date, -14), addDays(change.date, -1))
      const preDrift = nearHalf.avg - priorHalf.avg
      const driftKnown = priorHalf.n >= 3 && nearHalf.n >= 3
      const stable = !driftKnown || Math.abs(preDrift) < metric.threshold / 2
      const reversal = driftKnown && !stable && Math.sign(onsetMove) !== Math.sign(preDrift)
      if (!stable && !reversal) continue

      // A reversal is measured against where the metric stood right before the change (its
      // ramp would dilute a month-long baseline and understate the turnaround).
      const base = reversal ? nearHalf : baseline
      const delta = recent.avg - base.avg
      if (Math.abs(delta) < metric.threshold) continue
      const finding: TrendFinding = {
        key: metric.key,
        label: metric.label,
        unit: metric.unit,
        recentAvg: round(recent.avg, metric.decimals),
        baselineAvg: round(base.avg, metric.decimals),
        delta: round(delta, metric.decimals),
        since: change,
        reversal,
        significance: Math.abs(delta) / metric.threshold
      }
      if (reversal) {
        reversalAnchor = finding // chronological loop → keeps the most recent
      }
      else if (!stableAnchor) {
        stableAnchor = finding // → keeps the earliest
      }
      else if (stableAnchor.since?.kind === 'adjust' && change.kind !== 'adjust'
        && dayDiff(change.date, stableAnchor.since.date) <= CLUSTER_GAP_DAYS) {
        // A start/stop within days of a held adjust anchor outranks it: a compound starting or
        // stopping is the bigger event when both moved together (e.g. GHK-Cu going daily two
        // days before TRT began — the TRT start is the story).
        stableAnchor = finding
      }
    }
    let best = reversalAnchor ?? stableAnchor

    // No protocol change explains it (or none cleared the bar): check for plain drift,
    // last 2 weeks vs the ~6 weeks before that.
    if (!best) {
      const recent = avgInWindow(points, addDays(endDate, -13), endDate)
      const prior = avgInWindow(points, addDays(endDate, -55), addDays(endDate, -14))
      if (recent.n >= MIN_POINTS && prior.n >= MIN_POINTS) {
        const delta = recent.avg - prior.avg
        if (Math.abs(delta) >= metric.threshold) {
          best = {
            key: metric.key,
            label: metric.label,
            unit: metric.unit,
            recentAvg: round(recent.avg, metric.decimals),
            baselineAvg: round(prior.avg, metric.decimals),
            delta: round(delta, metric.decimals),
            significance: Math.abs(delta) / metric.threshold
          }
        }
      }
    }

    if (best) findings.push(best)
  }

  findings.sort((a, b) => b.significance - a.significance)
  return { changes, findings }
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// Renders the trends as fact-sheet lines for the digest prompt.
export function formatTrendLines(trends: TrendsResult): string[] {
  const lines: string[] = []
  if (trends.changes.length) {
    lines.push(`Protocol changes (last ${CHANGE_LOOKBACK_DAYS} days): ${trends.changes
      .map(c => c.kind === 'stop'
        ? `${c.compounds.join(' + ')} stopped around ${fmtDate(c.date)} (no doses logged since)`
        : c.kind === 'adjust'
          ? `${c.compounds.join(' + ')} dosing changed ${fmtDate(c.date)}`
          : `${c.compounds.join(' + ')} began ${fmtDate(c.date)}`)
      .join('; ')}`)
  }
  for (const f of trends.findings) {
    const sign = f.delta >= 0 ? '+' : ''
    if (f.since) {
      const verb = f.since.kind === 'stop' ? 'stopped' : f.since.kind === 'adjust' ? 'changed dosing' : 'began'
      const window = f.reversal ? 'the 2 weeks' : 'the month'
      lines.push(`${f.label}: avg ${f.recentAvg} ${f.unit} over the last 2 weeks, vs ${f.baselineAvg} in ${window} before ${f.since.compounds.join(' + ')} ${verb} (${fmtDate(f.since.date)})${f.reversal ? ' — reversed direction' : ''} — ${sign}${f.delta} ${f.unit}`)
    }
    else {
      lines.push(`${f.label}: avg ${f.recentAvg} ${f.unit} over the last 2 weeks, vs ${f.baselineAvg} over the ~6 weeks before — ${sign}${f.delta} ${f.unit}`)
    }
  }
  return lines
}
