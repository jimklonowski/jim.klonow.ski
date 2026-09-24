// Planned cycles as AI-prompt context (digests, lab summaries, the ask chat), plus the loader the
// digest's schedule check shares. Pronoun-free, like the rest of the prompt prose.
import type { Cycle, CyclePlanItem, StartPrecision } from '#shared/utils/cycles'
import {
  BASELINE_LOOKBACK_DAYS, checkpointStates, cycleEnd, cycleProgress, cycleStatusOn,
  doseLabelOf, durationLabel, isTentative, tentativeStartLabel
} from '#shared/utils/cycles'
import { diffDays, shiftDays } from '#shared/utils/dates'
import type { SignalHealthRow, SignalJournalRow } from '#shared/utils/cycleSignals'
import { activeSignals, computeCycleSignals, signalShorthand } from '#shared/utils/cycleSignals'
import { cadenceOf } from '#shared/utils/protocolProse'

function itemLine(item: CyclePlanItem, plannedWeeks: number): string {
  const to = item.toWeek ?? plannedWeeks
  const span = item.fromWeek === 1 && to === plannedWeeks ? 'full run' : `weeks ${item.fromWeek}–${to}`
  return `${item.compound} ${doseLabelOf(item)} ${cadenceOf(item.weekdays)} (${span})`
}

const GATING_PROSE = 'the gating markers (lipids — especially HDL — ALT/AST, hematocrit/hemoglobin, ferritin/iron, blood pressure, estradiol)'

// How far out an upcoming cycle is worth telling the AI about, and how long a finished one
// stays relevant (recovery draws land ~4-6 weeks post-end; marker normalization takes longer).
const UPCOMING_HORIZON_DAYS = 60
const DONE_RELEVANCE_DAYS = 120
// Tentative plans get a wider, symmetric window: planning talk runs further ahead than a
// committed start, and an anchor month that has come and gone without the run starting is
// itself worth knowing ("that October plan never happened").
const TENTATIVE_HORIZON_DAYS = 120

// Every planned cycle on file, oldest start first. Empty when the table doesn't exist yet, so
// nothing built on it (cycleContext, the digest's schedule check) dies on a missing migration.
export async function loadCycles(db: D1Database): Promise<Cycle[]> {
  let rows: Array<Record<string, unknown>>
  try {
    const { results } = await db.prepare('SELECT * FROM cycles ORDER BY start_date ASC').all()
    rows = (results ?? []) as Array<Record<string, unknown>>
  }
  catch {
    return []
  }
  return rows.map(row => ({
    id: row.id as number,
    name: row.name as string,
    goal: (row.goal as string | null) ?? null,
    start_date: row.start_date as string,
    start_precision: (row.start_precision as StartPrecision | undefined) ?? 'day',
    planned_weeks: row.planned_weeks as number,
    planned_days: (row.planned_days as number | null | undefined) ?? null,
    actual_end: (row.actual_end as string | null) ?? null,
    compounds: JSON.parse((row.compounds as string) || '[]') as CyclePlanItem[],
    notes: (row.notes as string | null) ?? null
  }))
}

// Planned cycles as they stood on `asOf`, rendered as prompt paragraphs — the counterpart of
// supplementContext for the cycles table. asOf matters for the same reason: lab summaries can
// regenerate for historical draws, and "day 34 of the cycle" must be day 34 as of THAT draw.
// Returns '' when there's nothing relevant. Callers that already hold the cycles (the digest
// loads them for its schedule check) pass them in to skip the second read.
export async function cycleContext(db: D1Database, asOf: string, preloaded?: Cycle[]): Promise<string> {
  let cycles: Cycle[]
  let drawDates: string[]
  try {
    const [loaded, labsRes] = await Promise.all([
      preloaded ?? loadCycles(db),
      db.prepare('SELECT date FROM labs_entries ORDER BY date ASC').all()
    ])
    cycles = loaded
    drawDates = ((labsRes.results ?? []) as Array<{ date: string }>).map(r => r.date)
  }
  catch {
    return ''
  }
  if (!cycles.length) return ''

  // Vitals rows for the passive signals watch — fetched once, and only when a cycle is
  // actually active at asOf (the windows are small: earliest baseline start → asOf).
  let journalRows: SignalJournalRow[] = []
  let healthRows: SignalHealthRow[] = []
  const activeCycles = cycles.filter(c => cycleStatusOn(c, asOf) === 'active')
  if (activeCycles.length) {
    try {
      const from = shiftDays(activeCycles.map(c => c.start_date).sort()[0]!, -28)
      const [jRes, hRes] = await Promise.all([
        db.prepare('SELECT date, weight_lbs, bp_systolic, rhr, hrv FROM journal_entries WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC').bind(from, asOf).all(),
        db.prepare('SELECT date, recovery_score, sleep_total_min FROM health_metrics WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC').bind(from, asOf).all()
      ])
      journalRows = (jRes.results ?? []) as unknown as SignalJournalRow[]
      healthRows = (hRes.results ?? []) as unknown as SignalHealthRow[]
    }
    catch {
      // Signals are an enrichment — a failed vitals query must not cost the whole context.
    }
  }

  const paragraphs: string[] = []
  for (const cycle of cycles) {
    const status = cycleStatusOn(cycle, asOf)
    const end = cycleEnd(cycle)
    const plan = cycle.compounds.map(i => itemLine(i, cycle.planned_weeks)).join('; ')
    const goal = cycle.goal ? ` Goal: ${cycle.goal}.` : ''
    const notes = cycle.notes ? ` Notes: ${cycle.notes}` : ''
    const baseline = checkpointStates(cycle, drawDates, asOf).find(cp => cp.key === 'baseline')

    if (status === 'active') {
      const p = cycleProgress(cycle, asOf)
      const baselineLine = baseline?.drawDate
        ? `compare ${GATING_PROSE} against the pre-cycle baseline draw (${baseline.drawDate}) and quantify the shifts`
        : `no pre-cycle baseline draw exists, so compare ${GATING_PROSE} against the most recent prior draws and say the baseline is soft`

      // The passive vitals watch, precomputed so the model narrates deterministic numbers:
      // watch/flagged shorthands with the weight rate, steady metrics as one clause.
      const signals = computeCycleSignals(cycle, asOf, journalRows, healthRows)
      const measured = signals.filter(s => s.state === 'steady' || s.state === 'watch' || s.state === 'flagged')
      const act = activeSignals(signals)
      const signalsLine = !measured.length
        ? ''
        : act.length
          ? ` Passive vitals watch (last 2 weeks vs the 4-week pre-start baseline, noise-thresholded): ${act.map((s) => {
            const rate = s.key === 'weight' && s.ratePerWeek != null && Math.abs(s.ratePerWeek) >= 1
              ? ` at ${s.ratePerWeek > 0 ? '+' : ''}${s.ratePerWeek} lbs/wk`
              : ''
            return `${s.state === 'flagged' ? 'FLAGGED' : 'watch'}: ${signalShorthand(s)}${rate}${s.adverse ? '' : ' (moving in the good direction)'}`
          }).join('; ')}${measured.some(s => s.state === 'steady') ? `; steady: ${measured.filter(s => s.state === 'steady').map(s => s.label).join(', ')}` : ''}. Treat these as the objective side-effect watch — explain the likely mechanism behind flagged ones (e.g. fast weight gain on-cycle usually reads as water retention).`
          : ` Passive vitals watch: all measured vitals (${measured.map(s => s.label).join(', ')}) are steady vs the pre-start baseline.`

      paragraphs.push(
        `PLANNED CYCLE — ACTIVE: "${cycle.name}", day ${p.day} of ${p.totalDays} (week ${p.week} of ${p.totalWeeks}; started ${cycle.start_date}, runs through ${end}${cycle.actual_end ? ', ended off-plan' : ''}).${goal} Plan: ${plan}. This layers on the standing schedule above — where the same compound appears in both, the cycle dose replaces the standing one for its window. Anchor interpretation to cycle timing: ${baselineLine}, and weigh whether each shift tracks the cycle's start before attributing it elsewhere. Name this cycle and its day count in the recap, and relate the period's data to the goal and to whatever the notes say to watch for or would end it early — the log showing its doses is not the story; what it is for is.${signalsLine}${notes}`
      )
    }
    // No committed start: intent on file, not a schedule. Said explicitly, because the model
    // would otherwise read the anchor date as a start and count days to it.
    else if (isTentative(cycle) && Math.abs(diffDays(asOf, cycle.start_date)) <= TENTATIVE_HORIZON_DAYS) {
      const lastDraw = drawDates.at(-1) ?? null
      const drawAge = lastDraw ? diffDays(lastDraw, asOf) : null
      const baselineLine = drawAge != null && drawAge <= BASELINE_LOOKBACK_DAYS
        ? `The ${lastDraw} draw is recent enough (${drawAge} days old) to serve as the pre-cycle baseline if the run starts soon.`
        : `No draw is recent enough to serve as a baseline (${lastDraw ? `latest is ${lastDraw}, ${drawAge} days old` : 'none on file'}) — getting one before the run starts matters more than anything else about this plan; say so when labs come up.`
      paragraphs.push(
        `PLANNED CYCLE — NOT SCHEDULED: "${cycle.name}", pencilled in for ${tentativeStartLabel(cycle)}, ${durationLabel(cycle)} planned.${goal} Plan: ${plan}. No start date is committed — treat this as intent, not a schedule: do not state or imply a start date, do not count days to it, and treat none of it as active or upcoming exposure. ${baselineLine}${notes}`
      )
    }
    else if (status === 'upcoming' && diffDays(asOf, cycle.start_date) <= UPCOMING_HORIZON_DAYS) {
      const inDays = diffDays(asOf, cycle.start_date)
      const baselineLine = baseline?.drawDate
        ? `The ${baseline.drawDate} draw (${diffDays(baseline.drawDate, cycle.start_date)} days pre-start) serves as the baseline.`
        : 'No baseline draw yet — getting one before the start matters more than anything else about this plan; say so when labs come up.'
      paragraphs.push(
        `PLANNED CYCLE — UPCOMING: "${cycle.name}" starts ${cycle.start_date} (in ${inDays} days), ${durationLabel(cycle)} planned.${goal} Plan: ${plan}. Nothing from this plan is active exposure yet. ${baselineLine}${notes}`
      )
    }
    else if (status === 'done' && diffDays(end, asOf) <= DONE_RELEVANCE_DAYS) {
      // A day-exact plan reports in days; rounding it to weeks would round a 10-day run to "1 week".
      const ranLabel = cycle.planned_days != null
        ? `${diffDays(cycle.start_date, end) + 1} of ${cycle.planned_days} planned days`
        : `${Math.round(diffDays(cycle.start_date, end) / 7)} of ${cycle.planned_weeks} planned weeks`
      const recovery = checkpointStates(cycle, drawDates, asOf).find(cp => cp.key === 'recovery')
      const recoveryLine = recovery?.drawDate
        ? `A recovery draw exists (${recovery.drawDate}) — judge whether ${GATING_PROSE} actually returned toward the pre-cycle baseline${baseline?.drawDate ? ` (${baseline.drawDate})` : ''}.`
        : `Expect ${GATING_PROSE} to drift back toward baseline; a recovery draw in the ${recovery?.windowFrom}–${recovery?.windowTo} window would confirm it.`
      paragraphs.push(
        `PLANNED CYCLE — RECENTLY COMPLETED: "${cycle.name}" ran ${cycle.start_date} → ${end} (${ranLabel}${cycle.actual_end ? ', ended off-plan' : ''}). Plan was: ${plan}. ${recoveryLine}${notes}`
      )
    }
  }
  return paragraphs.join('\n\n')
}
