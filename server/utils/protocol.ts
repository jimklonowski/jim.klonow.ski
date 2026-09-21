// Standing protocol context shared by the digest prompts and the labs AI-summary prompt.
// The injectable schedule is a hand-maintained constant (it changes rarely and carries intent —
// which weekdays — that the dose log can't express). The same cadence exists in structured form
// as PROTOCOL_RULES in shared/utils/protocolRules.ts (adherence panel + calendar rings, and the
// digest's precomputed schedule check below) — keep the two in sync when the protocol changes.
// The vitamin/supplement/skin stack lives in the `supplements` table and is rendered
// per-request by supplementContext(), so edits on /journal/supplements flow into the AI
// prompts without a deploy.
// Written pronoun-free so it drops into prompts that refer to the reader as "he" or "they".
import type { Cycle, CyclePlanItem, StartPrecision } from '#shared/utils/cycles'
import {
  BASELINE_LOOKBACK_DAYS, checkpointStates, cycleEnd, cycleProgress, cycleStatusOn,
  diffDays, doseLabelOf, isTentative, tentativeStartLabel
} from '#shared/utils/cycles'
import type { ProtocolRule, ScheduleTally } from '#shared/utils/protocolRules'
import { nextDueDay, ruleActiveOn, tallySchedule, weekdayOf } from '#shared/utils/protocolRules'
import type { SignalHealthRow, SignalJournalRow } from '#shared/utils/cycleSignals'
import { activeSignals, computeCycleSignals, signalShorthand } from '#shared/utils/cycleSignals'
import type { Vaccination } from '#shared/utils/vaccines'
import { VACCINE_EFFECT_DAYS, recentVaccinations, vaccineCoverage, vaccineFamily } from '#shared/utils/vaccines'

export const PROTOCOL_SCHEDULE = `Intended dosing schedule (the reference for adherence — journal dose logs should line up with this; call out deviations, don't re-announce matches):
- Every day: HGH 2.5 IU (raised from 2 IU on 2026-09-03, via 2.25 IU on 09-02).
- Every morning: Tadalafil 5 mg oral (daily-protocol Cialis, since ~June 2025 — 7 mg gummies until June 2, 2026, 5 mg tablets since). Taken for endothelial/BP support; it is deliberately NOT in the dose log, so never read its absence there as a missed dose. Its mild BP-lowering effect is standing context when interpreting blood-pressure trends.
- Monday + Thursday: Testosterone Cypionate 75 mg per injection (150 mg/week — reduced from 100 mg/injection, 200 mg/week, in late August 2026).
- Tuesday + Friday + Sunday: hCG 300 IU (raised from 250 IU on 2026-09-08).
- Testosterone Cypionate, HGH, and hCG are the only injectables currently running.
- BPC-157 is as-needed only (for soreness/tightness), so sporadic logging is expected, not a lapse.
- GHK-Cu 2 mg daily ran until 2026-09-01 and is now discontinued — the vial finished and another is not being reconstituted for the time being. Its absence from the dose log is deliberate, never a missed dose.`

// --- dated one-off events ---

// Things the data streams can't explain on their own — travel, a draw-day deviation, an
// illness. Hand-maintained like PROTOCOL_SCHEDULE, but each entry is dated and ages out of the
// prompts by itself (eventContext), so the list only ever grows; never prune an entry to "fix"
// a prompt. Each note says how to READ the data around it, not just what happened — the model
// sees the same dose log and vitals and would otherwise narrate the gap as a lapse.
export interface ProtocolEvent {
  /** First day, YYYY-MM-DD. */
  from: string
  /** Last day, inclusive. Omit for a single-day event. */
  to?: string
  /** Days after `to` the note keeps appearing in prompts; defaults to EVENT_RELEVANCE_DAYS. */
  relevanceDays?: number
  /** Pronoun-free prose. */
  note: string
}

// Three weeks: long enough that a draw the week after a disruption still sees it, short enough
// that a weekend of missed doses isn't still being explained in October.
const EVENT_RELEVANCE_DAYS = 21

export const PROTOCOL_EVENTS: ProtocolEvent[] = [
  {
    from: '2026-09-05',
    to: '2026-09-07',
    note: 'Labor Day weekend travel, Sat 2026-09-05 through Mon 2026-09-07. The trip — not a protocol change — disrupted dosing: HGH was missed on 09-06 and 09-07, the Sunday hCG dose (09-06) was skipped, and the Monday testosterone injection went in around 12:45 on 09-07 instead of the usual ~04:15 slot (it is logged at its actual time). Read the gap as travel, never as a stop, a taper, or an adherence trend, and mention it once rather than as a recurring headline. Modeled HGH exposure sits a little under steady state for a few days afterwards, so IGF-1 on a draw within the following week may read somewhat below its usual level.'
  },
  {
    from: '2026-09-09',
    // The draw itself is only news for a couple of days. The labs summary for this date always
    // sees the note regardless, because that prompt's asOf IS the draw date.
    relevanceDays: 3,
    note: 'Bloodwork was drawn 2026-09-09 at about 07:50. The morning oral stack — finasteride and iron included — was deliberately held until after the draw, so none of that day\'s orals were on board in the sample; this matters most for serum iron, which a same-morning iron dose would inflate, and marginally for DHT. COVID-19, influenza, and tetanus vaccines followed at about 08:30 — after the blood was taken, so they cannot have influenced this draw\'s results (see the vaccination context for the days after). Total testosterone on this panel was run by immunoassay rather than LC/MS-MS, and that assay reports only as high as 1500 ng/dL: the reported 1500 is a censored ceiling meaning "at least 1500", not a measured value, and the panel carried its own 264-916 ng/dL reference range rather than the usual one. Never read it as a fall from the 2211 measured by LC/MS-MS on 2026-08-15, never compute a delta against it, and never cite it as evidence for or against the effect of the testosterone dose reduction.'
  },
  {
    from: '2026-09-18',
    // Adjust `to` to the actual last day — the run is 7 to 10 days and 09-27 is the 10-day end.
    // 30 days (rather than the default 21) so the 2026-10-17 labs summary still sees this note
    // even if the protocol is cut short at 7 days; that draw's iron panel is unreadable without it.
    to: '2026-09-27',
    relevanceDays: 30,
    note: 'Deliberate short iron-loading protocol, 2026-09-18 through about 2026-09-27: 75 mg iron bisglycinate three times a day at roughly 08:00, 14:00, and 20:00, about 225 mg/day elemental, replacing the standing 50 mg once-daily iron supplement for the duration. The goal is the opposite of ordinary iron repletion. An oral dose above 60 mg raises hepcidin for about 24 hours and blunts absorption of any later dose, so splitting the dose deliberately holds hepcidin high, which traps iron recycled from senescent red cells in storage instead of releasing it into erythropoiesis. Read this as a bounded experiment aimed at raising ferritin from a low baseline, never as a permanent supplement change, a dosing error, or a sign of iron-deficiency treatment as usual. Vitamin D, vitamin C, alcohol, and intense sun or tanning bed exposure are all held for the duration because each lowers hepcidin and would work against the protocol; those gaps are part of the plan and must never be reported as missed doses, a stopped supplement, or an adherence lapse. Some GI upset is expected at this dose and is not a new symptom to investigate. Hematocrit and hemoglobin are NOT expected to fall: red cell mass turns over at only about 1 percent per day, so a ten-day intervention cannot meaningfully reduce it, and flat counts alongside a higher ferritin is the intended result rather than a disappointment. Any serum iron, transferrin saturation, or ferritin measured during the protocol or within roughly a week after reflects an acute iron load and not a steady-state iron store, so treat such a value as inflated and say so. The baseline to compare against is the 2026-08-15 panel: ferritin 16 ng/mL, saturation 17 percent, TIBC 330 mcg/dL, serum iron 56 mcg/dL.'
  }
]

// The dated notes in force on `asOf`: begun by then and not yet past their relevance window.
// Pure and synchronous — nothing here comes from the database.
export function eventContext(asOf: string, events: ProtocolEvent[] = PROTOCOL_EVENTS): string {
  const active = events.filter((e) => {
    const last = e.to ?? e.from
    return e.from <= asOf && diffDays(last, asOf) <= (e.relevanceDays ?? EVENT_RELEVANCE_DAYS)
  })
  if (!active.length) return ''
  return `Dated notes — one-off context the data streams can't explain on their own (travel, draw-day deviations). Use these before speculating about anomalies in the same window, and don't re-headline them once the window has passed:\n${active.map(e => `- ${e.note}`).join('\n')}`
}

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

/** 'daily' or 'Mon+Thu' — Monday-first, since that's how a week reads. */
function cadenceOf(weekdays: number[]): string {
  if (weekdays.length === 7) return 'daily'
  return [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAY_NAMES[d]).join('+')
}

/** "Wed Sep 9" — every date the digest prompts show carries its weekday, because the schedule
 * is expressed in weekdays and the model should never have to derive one from a date. */
export function fmtDay(d: string): string {
  const monthDay = new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${DAY_NAMES[weekdayOf(d)]} ${monthDay}`
}

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

// --- schedule check (planned vs logged) ---

// The digest prompts used to hand the model "Recap for Sep 9" plus a weekday-based schedule and
// let it work out that Sep 9 was a Wednesday. It guessed. These lines resolve the weekday math
// deterministically — what was due, what was logged, what was missed, what is still open — so
// the model narrates numbers instead of computing them, the same way the trend and cycle-signal
// context already works.

/** "Sun Sep 6, Mon Sep 7 and Tue Sep 8" */
function listDays(dates: string[]): string {
  const days = dates.map(fmtDay)
  return days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} and ${days.at(-1)}`
}

function dailyScheduleLine(date: string, tallies: ScheduleTally[], today: string): string {
  const open = date >= today
  const due = tallies.filter(t => t.hit.length || t.missed.length || t.pending)
  const logged = due.filter(t => t.hit.length)
  const unlogged = due.filter(t => !t.hit.length)
  const notDue = tallies.filter(t => !due.includes(t) && ruleActiveOn(t.rule, date))
  const off = tallies.filter(t => t.offSchedule.length)
  const names = (list: ScheduleTally[]) => list.map(t => t.rule.compound).join(', ')

  const parts = [
    `Schedule check for ${fmtDay(date)}, against the intended schedule above with any planned cycle layered in — due today: ${due.length ? due.map(t => `${t.rule.compound} ${t.rule.doseLabel} (${cadenceOf(t.rule.weekdays)})`).join(', ') : 'nothing'}.`
  ]
  if (logged.length) parts.push(`Logged: ${names(logged)}.`)
  if (unlogged.length) {
    parts.push(open
      ? `Not yet logged: ${names(unlogged)} — this recap is being written while the day is still under way (Chicago time), so treat that as open, not missed.`
      : `Missed (due, never logged): ${names(unlogged)}.`)
  }
  if (notDue.length) {
    parts.push(`Not due today: ${notDue.map((t) => {
      const next = nextDueDay(t.rule, date)
      return `${t.rule.compound} (${cadenceOf(t.rule.weekdays)}${next ? `; next ${fmtDay(next)}` : ''})`
    }).join(', ')}.`)
  }
  if (off.length) parts.push(`Off-schedule today: ${names(off)} — not one of its days, so an extra or a slid dose.`)
  return parts.join(' ')
}

function weeklyScheduleLines(start: string, end: string, tallies: ScheduleTally[], today: string): string {
  const rows = tallies.filter(t => t.hit.length || t.missed.length || t.pending || t.offSchedule.length)
  if (!rows.length) return ''
  const open = end >= today
  const lines = rows.map((t) => {
    const dueDates = [...t.hit, ...t.missed].sort()
    const daily = t.rule.weekdays.length === 7
    const window = t.rule.to != null && t.rule.to < end
      ? `, schedule ended ${fmtDay(t.rule.to)}`
      : t.rule.from > start ? `, schedule began ${fmtDay(t.rule.from)}` : ''
    let line = `- ${t.rule.compound} ${t.rule.doseLabel} (${cadenceOf(t.rule.weekdays)}${window}): `
    line += dueDates.length
      ? `${daily ? `${dueDates.length} days due` : `due ${listDays(dueDates)}`} — ${t.hit.length} logged`
      : 'nothing due'
    if (t.missed.length) line += `; missed ${listDays(t.missed)}`
    if (t.pending) line += `; due today (${fmtDay(t.pending)}), not yet logged`
    if (t.offSchedule.length) line += `; off-schedule dose${t.offSchedule.length > 1 ? 's' : ''} ${listDays(t.offSchedule)}`
    return line + '.'
  })
  const header = `Schedule check for ${fmtDay(start)} – ${fmtDay(end)}, against the intended schedule above with any planned cycle layered in (a missed day followed within a day or two by an off-schedule dose is a slid dose, not a lapse${open ? '; the week is still under way, so days after today are not counted and today only counts once logged' : ''}):`
  return [header, ...lines].join('\n')
}

// Planned-vs-logged for the digest period as prompt fact lines: one sentence for a single day,
// a header plus one line per compound for a week. `rules` is the effective schedule (standing
// rules with any planned cycle merged in); `doseDates` maps compound → logged dates; `today` is
// the home-timezone date, so a same-day regenerate reads "not yet logged" rather than "missed".
// Pure and synchronous. Returns '' when no rule is in force in the window.
export function scheduleContext(
  rules: ProtocolRule[],
  start: string,
  end: string,
  doseDates: Map<string, Set<string>>,
  today: string
): string {
  const tallies = tallySchedule(rules, start, end, doseDates, today)
  if (!tallies.length) return ''
  return start === end
    ? dailyScheduleLine(start, tallies, today)
    : weeklyScheduleLines(start, end, tallies, today)
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

// --- vaccinations ---

// Vaccinations as they bear on `asOf`. Shots within VACCINE_EFFECT_DAYS get the acute-response
// caveat (vitals for a few days, acute-phase blood markers for a couple of weeks); scope 'all'
// (the ask-the-data chat) adds the whole immunization record with next-due dates, so "when was
// my last tetanus shot?" has an answer. Same asOf / try-catch contract as supplementContext.
export async function vaccineContext(db: D1Database, asOf: string, scope: 'recent' | 'all' = 'recent'): Promise<string> {
  let rows: Vaccination[]
  try {
    const { results } = await db.prepare(
      'SELECT date, vaccine, product, notes FROM vaccinations WHERE date <= ?1 ORDER BY date ASC'
    ).bind(asOf).all()
    rows = (results ?? []) as unknown as Vaccination[]
  }
  catch {
    return ''
  }
  if (!rows.length) return ''

  const paragraphs: string[] = []

  const recent = recentVaccinations(rows, asOf)
  if (recent.length) {
    const byDate = new Map<string, Vaccination[]>()
    for (const r of recent) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])
    const entries = [...byDate].map(([date, list]) => {
      const ago = diffDays(date, asOf)
      const when = ago === 0 ? 'the same day' : `${ago} day${ago === 1 ? '' : 's'} earlier`
      const shots = list.map(r => r.product ? `${r.vaccine} (${r.product})` : r.vaccine).join(', ')
      // Three shots from one visit usually share one note — say it once.
      const notes = [...new Set(list.map(r => r.notes?.trim()).filter(Boolean))]
      return `${date} (${when}): ${shots}${notes.length ? ` — ${notes.join('; ')}` : ''}`
    })
    paragraphs.push(`Recent vaccinations (within ${VACCINE_EFFECT_DAYS} days of ${asOf}): ${entries.join('; ')}. A vaccine triggers a deliberate, short-lived immune response: for one to three days afterwards expect lower HRV, a higher resting heart rate, dented recovery and sleep scores, and possibly soreness or a low-grade fever — attribute vitals in that window to the shots before anything in the protocol, and say so plainly. On bloodwork drawn within about two weeks of a shot, acute-phase markers can read transiently high — white blood cells, CRP, ESR, and ferritin (so a ferritin bump here is not evidence of iron repletion) — weigh recency before calling such a shift a trend. A vaccination dated the same day as a draw only bears on that draw if it preceded the blood collection; the notes say which.`)
  }

  if (scope === 'all') {
    const datesByFamily = new Map<string, string[]>()
    for (const r of rows) {
      const key = vaccineFamily(r)
      datesByFamily.set(key, [...(datesByFamily.get(key) ?? []), r.product ? `${r.date} (${r.product})` : r.date])
    }
    const lines = vaccineCoverage(rows, asOf).map((c) => {
      const due = c.nextDue
        ? c.status === 'overdue' ? `booster overdue since ${c.nextDue}` : `next booster due ~${c.nextDue}`
        : 'no routine booster interval'
      return `- ${c.label}: ${(datesByFamily.get(c.family) ?? []).join(', ')} — ${due}`
    })
    paragraphs.push(`Immunization record (every dose on file, oldest first per vaccine; a vaccine with no entry has no recorded date, which is not the same as never having had it):\n${lines.join('\n')}`)
  }

  return paragraphs.join('\n\n')
}
