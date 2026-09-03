// Standing protocol context shared by the digest prompts and the labs AI-summary prompt.
// The injectable schedule is a hand-maintained constant (it changes rarely and carries intent —
// which weekdays — that the dose log can't express). The same cadence exists in structured form
// as PROTOCOL_RULES in app/data/journal.ts (adherence panel + calendar rings) — keep the two in
// sync when the protocol changes. The vitamin/supplement/skin stack lives in
// the `supplements` table and is rendered per-request by supplementContext(), so edits on
// /journal/supplements flow into the AI prompts without a deploy.
// Written pronoun-free so it drops into prompts that refer to the reader as "he" or "they".
import type { Cycle, CyclePlanItem, StartPrecision } from '#shared/utils/cycles'
import {
  BASELINE_LOOKBACK_DAYS, checkpointStates, cycleEnd, cycleProgress, cycleStatusOn,
  diffDays, doseLabelOf, isTentative, tentativeStartLabel
} from '#shared/utils/cycles'
import type { SignalHealthRow, SignalJournalRow } from '#shared/utils/cycleSignals'
import { activeSignals, computeCycleSignals, signalShorthand } from '#shared/utils/cycleSignals'

export const PROTOCOL_SCHEDULE = `Intended dosing schedule (the reference for adherence — journal dose logs should line up with this; call out deviations, don't re-announce matches):
- Every day: HGH 2 IU.
- Every morning: Tadalafil 5 mg oral (daily-protocol Cialis, since ~June 2025 — 7 mg gummies until June 2, 2026, 5 mg tablets since). Taken for endothelial/BP support; it is deliberately NOT in the dose log, so never read its absence there as a missed dose. Its mild BP-lowering effect is standing context when interpreting blood-pressure trends.
- Monday + Thursday: Testosterone Cypionate 75 mg per injection (150 mg/week — reduced from 100 mg/injection, 200 mg/week, in late August 2026).
- Tuesday + Friday + Sunday: hCG 250 IU.
- Testosterone Cypionate, HGH, and hCG are the only injectables currently running.
- BPC-157 is as-needed only (for soreness/tightness), so sporadic logging is expected, not a lapse.
- GHK-Cu 2 mg daily ran until 2026-09-01 and is now discontinued — the vial finished and another is not being reconstituted for the time being. Its absence from the dose log is deliberate, never a missed dose.`

// How long a stopped supplement (or a fresh start) stays worth mentioning — matches the
// ~4-month protocol lookback the labs summary and digest trends already use.
const CHANGE_RELEVANCE_DAYS = 120

interface SupplementRow {
  name: string
  dose: string | null
  category: string
  status: string
  schedule: string
  started: string | null
  stopped: string | null
  notes: string | null
}

function shiftDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function describe(s: SupplementRow, recentSince: string): string {
  const parts = [s.name]
  if (s.dose) parts.push(s.dose)
  let out = parts.join(' ')
  if (s.schedule && s.schedule !== 'daily') out += ` (${s.schedule})`
  if (s.started && s.started >= recentSince) out += ` (started ${s.started})`
  if (s.notes) out += ` — ${s.notes}`
  return out
}

// --- planned cycles ---

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function itemLine(item: CyclePlanItem, plannedWeeks: number): string {
  const cadence = item.weekdays.length === 7
    ? 'daily'
    : [...item.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAY_NAMES[d]).join('+')
  const to = item.toWeek ?? plannedWeeks
  const span = item.fromWeek === 1 && to === plannedWeeks ? 'full run' : `weeks ${item.fromWeek}–${to}`
  return `${item.compound} ${doseLabelOf(item)} ${cadence} (${span})`
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

// Planned cycles as they stood on `asOf`, rendered as prompt paragraphs — the counterpart of
// supplementContext for the cycles table. asOf matters for the same reason: lab summaries can
// regenerate for historical draws, and "day 34 of the cycle" must be day 34 as of THAT draw.
// Returns '' when there's nothing relevant — including when the table doesn't exist yet, so
// digest generation never dies on a missing migration.
export async function cycleContext(db: D1Database, asOf: string): Promise<string> {
  let rows: Array<Record<string, unknown>>
  let drawDates: string[]
  try {
    const [cyclesRes, labsRes] = await Promise.all([
      db.prepare('SELECT * FROM cycles ORDER BY start_date ASC').all(),
      db.prepare('SELECT date FROM labs_entries ORDER BY date ASC').all()
    ])
    rows = (cyclesRes.results ?? []) as Array<Record<string, unknown>>
    drawDates = ((labsRes.results ?? []) as Array<{ date: string }>).map(r => r.date)
  }
  catch {
    return ''
  }

  const cycles: Cycle[] = rows.map(row => ({
    id: row.id as number,
    name: row.name as string,
    goal: (row.goal as string | null) ?? null,
    start_date: row.start_date as string,
    start_precision: (row.start_precision as StartPrecision | undefined) ?? 'day',
    planned_weeks: row.planned_weeks as number,
    actual_end: (row.actual_end as string | null) ?? null,
    compounds: JSON.parse((row.compounds as string) || '[]') as CyclePlanItem[],
    notes: (row.notes as string | null) ?? null
  }))

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
        `PLANNED CYCLE — ACTIVE: "${cycle.name}", day ${p.day} of ${p.totalDays} (week ${p.week} of ${p.totalWeeks}; started ${cycle.start_date}, runs through ${end}${cycle.actual_end ? ', ended off-plan' : ''}).${goal} Plan: ${plan}. This layers on the standing schedule above — where the same compound appears in both, the cycle dose replaces the standing one for its window. Anchor interpretation to cycle timing: ${baselineLine}, and weigh whether each shift tracks the cycle's start before attributing it elsewhere.${signalsLine}${notes}`
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
        `PLANNED CYCLE — NOT SCHEDULED: "${cycle.name}", pencilled in for ${tentativeStartLabel(cycle)}, ${cycle.planned_weeks} weeks planned.${goal} Plan: ${plan}. No start date is committed — treat this as intent, not a schedule: do not state or imply a start date, do not count days to it, and treat none of it as active or upcoming exposure. ${baselineLine}${notes}`
      )
    }
    else if (status === 'upcoming' && diffDays(asOf, cycle.start_date) <= UPCOMING_HORIZON_DAYS) {
      const inDays = diffDays(asOf, cycle.start_date)
      const baselineLine = baseline?.drawDate
        ? `The ${baseline.drawDate} draw (${diffDays(baseline.drawDate, cycle.start_date)} days pre-start) serves as the baseline.`
        : 'No baseline draw yet — getting one before the start matters more than anything else about this plan; say so when labs come up.'
      paragraphs.push(
        `PLANNED CYCLE — UPCOMING: "${cycle.name}" starts ${cycle.start_date} (in ${inDays} days), ${cycle.planned_weeks} weeks planned.${goal} Plan: ${plan}. Nothing from this plan is active exposure yet. ${baselineLine}${notes}`
      )
    }
    else if (status === 'done' && diffDays(end, asOf) <= DONE_RELEVANCE_DAYS) {
      const weeksRan = Math.round(diffDays(cycle.start_date, end) / 7)
      const recovery = checkpointStates(cycle, drawDates, asOf).find(cp => cp.key === 'recovery')
      const recoveryLine = recovery?.drawDate
        ? `A recovery draw exists (${recovery.drawDate}) — judge whether ${GATING_PROSE} actually returned toward the pre-cycle baseline${baseline?.drawDate ? ` (${baseline.drawDate})` : ''}.`
        : `Expect ${GATING_PROSE} to drift back toward baseline; a recovery draw in the ${recovery?.windowFrom}–${recovery?.windowTo} window would confirm it.`
      paragraphs.push(
        `PLANNED CYCLE — RECENTLY COMPLETED: "${cycle.name}" ran ${cycle.start_date} → ${end} (${weeksRan} of ${cycle.planned_weeks} planned weeks${cycle.actual_end ? ', ended off-plan' : ''}). Plan was: ${plan}. ${recoveryLine}${notes}`
      )
    }
  }
  return paragraphs.join('\n\n')
}

// The supplement stack as it stood on `asOf` (YYYY-MM-DD), rendered as prompt paragraphs.
// asOf matters because lab summaries can be (re)generated for historical draws: a supplement
// stopped after the draw was still active then. Returns '' when there's nothing to say —
// including when the table doesn't exist yet, so digest generation never dies on a missing
// migration.
export async function supplementContext(db: D1Database, asOf: string): Promise<string> {
  let rows: SupplementRow[]
  try {
    const { results } = await db.prepare(
      'SELECT name, dose, category, status, schedule, started, stopped, notes FROM supplements ORDER BY sort ASC, name ASC'
    ).all()
    rows = (results ?? []) as unknown as SupplementRow[]
  }
  catch {
    return ''
  }

  const recentSince = shiftDays(asOf, -CHANGE_RELEVANCE_DAYS)
  // A row stopped after asOf was still being taken at asOf (lab summaries can regenerate
  // for historical draws); on_hand rows are never part of the taken stack.
  const activeAt = (s: SupplementRow) =>
    s.status !== 'on_hand'
    && (s.started == null || s.started <= asOf)
    && (s.stopped == null || s.stopped > asOf)

  const oral = rows.filter(s => s.category !== 'skin' && activeAt(s))
  const skin = rows.filter(s => s.category === 'skin' && activeAt(s))
  const onHand = rows.filter(s => s.status === 'on_hand')
  const recentlyStopped = rows.filter(s => s.stopped != null && s.stopped <= asOf && s.stopped >= recentSince)

  const paragraphs: string[] = []
  if (oral.length) {
    paragraphs.push(`Daily oral stack, taken consistently but mostly NOT logged in the journal (absence from dose logs is not a lapse): ${oral.map(s => describe(s, recentSince)).join('; ')}.`)
  }
  if (skin.length) {
    paragraphs.push(`Skin/hair routine: ${skin.map(s => describe(s, recentSince)).join('; ')}.`)
  }
  if (recentlyStopped.length) {
    paragraphs.push(`Recently discontinued: ${recentlyStopped.map(s => `${s.name} (stopped ${s.stopped}${s.notes ? `; ${s.notes.toLowerCase()}` : ''})`).join('; ')}.`)
  }
  if (onHand.length) {
    paragraphs.push(`On hand but NOT currently being taken (do not treat as active exposure; relevant to pending decisions like the anabolic question): ${onHand.map(s => describe(s, recentSince)).join('; ')}.`)
  }
  return paragraphs.join('\n\n')
}
