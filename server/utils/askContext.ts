// Standing fact sheet for the ask-the-data chat: a bounded plain-text snapshot of everything
// the site tracks, rebuilt per request straight from D1. Unlike the digest builders (which
// summarize one period), this favors breadth — every lab draw, every DEXA scan, the whole
// dose history in aggregate — with full daily detail only for the recent window, so arbitrary
// questions can be answered without shipping 1,200 journal rows into the prompt.
import { profileLabel } from '#shared/utils/profile'
import { fmtSodaOz, sodaTotals } from '#shared/utils/soda'
import { drinkTotals, hydrationOz, isSodaEntry, sodasOnly } from '#shared/utils/drinks'
import { bpAverageLabel, bpLabel } from '#shared/utils/bloodPressure'
import { MEAL_SLOTS, MEAL_SLOT_LABELS, dayNutrition, hasFullFigures, isWholeDay, type EstimateIndex } from '#shared/utils/nutrition'
import type { JournalRow, SodaEntry, Vial } from '#shared/types/journal'
import { calcConcentration } from '#shared/utils/peptideCalc'
import { roundTo, shiftDays } from '#shared/utils/dates'
import { mean } from '#shared/utils/stats'
import { computeTrends, formatTrendLines } from '#shared/utils/trends'
import { eventContext } from '#shared/utils/protocolEvents'
import { describeTrend, weighInsOf, weightTrend } from '#shared/utils/weightTrend'
import { PROTOCOL_EVENTS } from '../data/protocolEvents'
import type { ProtocolData } from '#shared/utils/protocolStore'

const avg = mean

// "3 sodas (~27 oz)" — ounces alongside the count, since two mini cans read as "two" but are
// less soda than one 20 oz bottle (shared/utils/soda.ts).
// The drink list holds more than sodas (shared/utils/drinks.ts): the count is its sodas alone,
// then the other drinks by name and the caffeine the lot carried.
function sodaText(drinks: SodaEntry[], noun: string, estimates: EstimateIndex): string {
  const t = sodaTotals(sodasOnly(drinks))
  const oz = fmtSodaOz(t)
  const others = drinks.filter(s => !isSodaEntry(s)).map(s => [s.drink?.trim() || 'drink', s.size?.trim()].filter(Boolean).join(' '))
  const caffeine = drinkTotals(drinks, estimates.drinks).caffeine_mg
  return `${t.count} ${noun}${oz ? ` (${oz})` : ''}${others.length ? `, other drinks: ${others.join(' + ')}` : ''}${caffeine ? `, caffeine ${caffeine} mg` : ''}`
}

// "water ~84 oz/day (5 days logged)" — averaged over the days that logged any, since a day with
// no taps is unknown rather than zero. null when the window has none.
function waterText(entries: JournalRow[]): string | null {
  // Pours plus sports drinks, which count toward the water goal (hydrationOz).
  const logged = entries.filter(e => hydrationOz(e) > 0)
  const days = logged.length
  if (!days) return null
  const oz = logged.reduce((s, e) => s + hydrationOz(e), 0)
  return `water ~${Math.round(oz / days)} oz/day (${days} day${days === 1 ? '' : 's'} logged)`
}

async function journalRows(db: D1Database, since?: string): Promise<JournalRow[]> {
  const sql = `SELECT date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides, reconstitutions, sodas, water, food, notes
    FROM journal_entries ${since ? 'WHERE date >= ?1' : ''} ORDER BY date ASC`
  const stmt = since ? db.prepare(sql).bind(since) : db.prepare(sql)
  const { results } = await stmt.all()
  // server/utils/db.ts parseJournalRow — the one copy (this file had its own inline mapping).
  return (results ?? []).map(parseJournalRow)
}

// "food ≈ 1,850 kcal/day, 95 g protein/day (4 days with figures)" over the days logged through
// to dinner whose meals all have figures (the hub's rule, audit #43 item 34); null when none do.
function foodText(entries: JournalRow[], estimates: EstimateIndex): string | null {
  let days = 0
  let kcal = 0
  let protein = 0
  for (const e of entries) {
    if (!isWholeDay(e)) continue
    const n = dayNutrition(e, estimates)
    if (!hasFullFigures(n)) continue
    days++
    kcal += n.kcal
    protein += n.protein_g
  }
  if (!days) return null
  return `food ≈ ${Math.round(kcal / days)} kcal/day, ${Math.round(protein / days)} g protein/day (${days} day${days === 1 ? '' : 's'} with figures)`
}

// "meals: breakfast grilled cheese + guac; lunch costco pizza (≈ 1,250 kcal, 60 g protein)" — the
// day's meals as typed, with the total when every meal has figures (a floor otherwise, said so).
function mealsText(e: JournalRow, estimates: EstimateIndex): string | null {
  const slots = MEAL_SLOTS.filter(s => e.food?.[s]?.trim())
  if (!slots.length) return null
  const n = dayNutrition(e, estimates)
  const total = n.estimated
    ? ` (≈ ${Math.round(n.kcal)} kcal, ${Math.round(n.protein_g)} g protein${n.missing.length ? `, floor: ${n.missing.length} without figures` : ''})`
    : ''
  return `meals: ${slots.map(s => `${MEAL_SLOT_LABELS[s].toLowerCase()} ${e.food[s]!.trim()}`).join('; ')}${total}`
}

/** Every lab draw with all recorded markers — the model needs raw values to answer marker questions. */
async function labLines(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare(
    'SELECT date, fasting, markers FROM labs_entries ORDER BY date ASC'
  ).all()
  return (results ?? []).map((r) => {
    const markers = JSON.parse((r.markers as string) || '{}') as Record<string, number | null>
    const parts = Object.entries(markers)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k} ${v}`)
    return `${r.date}${r.fasting ? ' (fasting)' : ''}: ${parts.join(', ')}`
  })
}

async function dexaLines(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare(
    'SELECT date, weight_lbs, total, vat, ag_ratio FROM dexa_entries ORDER BY date ASC'
  ).all()
  return (results ?? []).map((r) => {
    const total = JSON.parse((r.total as string) || '{}') as Record<string, number>
    const vat = r.vat ? JSON.parse(r.vat as string) as Record<string, number> : null
    const parts = [
      `weight ${r.weight_lbs} lbs`,
      ...Object.entries(total).map(([k, v]) => `${k} ${v}`),
      vat ? `VAT ${Object.entries(vat).map(([k, v]) => `${k} ${v}`).join(' ')}` : null,
      r.ag_ratio != null ? `A/G ratio ${r.ag_ratio}` : null
    ].filter(Boolean)
    return `${r.date}: ${parts.join(', ')}`
  })
}

/** Every vial mixed, from the journal — "when did I last reconstitute hCG?" lives here. */
function reconstitutionLines(journal: JournalRow[]): string[] {
  const lines: string[] = []
  for (const e of journal) {
    for (const r of e.reconstitutions ?? []) {
      if (!r.compound) continue
      const concentration = calcConcentration(r.vial_amount, r.bac_water_ml)
      const parts = [
        `${r.vial_amount}${r.vial_unit} vial`,
        r.bac_water_ml ? `${r.bac_water_ml} mL BAC water` : null,
        concentration != null ? `${roundTo(concentration, 2)}${r.vial_unit}/mL` : null,
        r.supplier ? `from ${r.supplier}` : null
      ].filter(Boolean)
      lines.push(`${e.date}: ${r.compound} — ${parts.join(', ')}`)
    }
  }
  return lines
}

/**
 * The vial inventory (/tools/inventory): what is open and since when, what is sealed, what is
 * finished. [] on a database without the table; any other failure propagates.
 */
async function vialLines(db: D1Database): Promise<string[]> {
  try {
    const { results } = await db.prepare(
      `SELECT compound, vial_amount, vial_unit, form, unit_count, quantity, status, opened_date, bac_water_ml, supplier FROM vials
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'sealed' THEN 1 ELSE 2 END, opened_date DESC, compound ASC`
    ).all<Vial>()
    return (results ?? []).map((v) => {
      const content = `${v.vial_amount}${v.vial_unit}${v.form !== 'vial' ? ` ${v.form} bottle${v.unit_count ? ` of ${v.unit_count}` : ''}` : ''}`
      const parts = [
        v.status,
        v.quantity > 1 ? `×${v.quantity}` : null,
        v.opened_date ? `opened ${v.opened_date}` : null,
        v.bac_water_ml ? `${v.bac_water_ml} mL BAC water` : null,
        v.supplier ? `from ${v.supplier}` : null
      ].filter(Boolean)
      return `${v.compound} ${content}: ${parts.join(', ')}`
    })
  }
  catch (err) {
    if (isMissingTable(err)) return []
    throw err
  }
}

/** All-time per-compound usage: enough to answer "when did I run X and at what dose". */
function compoundLines(journal: JournalRow[]): string[] {
  const map = new Map<string, { first: string, last: string, days: Set<string>, total: number, unit: string }>()
  for (const e of journal) {
    for (const p of e.peptides ?? []) {
      if (!p.compound) continue
      const cur = map.get(p.compound) ?? { first: e.date, last: e.date, days: new Set<string>(), total: 0, unit: p.unit }
      cur.last = e.date
      cur.days.add(e.date)
      cur.total += p.dose
      map.set(p.compound, cur)
    }
  }
  return [...map.entries()]
    .sort(([, a], [, b]) => b.last.localeCompare(a.last))
    .map(([name, v]) =>
      `${name}: ${v.first} → ${v.last}, ${v.days.size} days, avg ${roundTo(v.total / v.days.size, 2)}${v.unit}/day used`
    )
}

/** Trailing weekly aggregates so month-scale questions don't need day rows. */
function weeklyLines(journal: JournalRow[], health: Array<Record<string, unknown>>, workouts: Array<Record<string, unknown>>, today: string, weeks: number, estimates: EstimateIndex): string[] {
  const lines: string[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const end = shiftDays(today, -7 * w)
    const start = shiftDays(end, -6)
    const j = journal.filter(e => e.date >= start && e.date <= end)
    const h = health.filter(e => (e.date as string) >= start && (e.date as string) <= end)
    const wo = workouts.filter(e => (e.date as string) >= start && (e.date as string) <= end)
    if (!j.length && !h.length && !wo.length) continue
    const parts = [
      avg(j.map(e => e.weight_lbs)) != null ? `weight ${roundTo(avg(j.map(e => e.weight_lbs))!)}` : null,
      avg(j.map(e => e.rhr)) != null ? `rhr ${roundTo(avg(j.map(e => e.rhr))!)}` : null,
      avg(j.map(e => e.hrv)) != null ? `hrv ${roundTo(avg(j.map(e => e.hrv))!)}` : null,
      // Full readings only (shared/utils/bloodPressure.ts): a week whose one cuff day lacked a
      // diastolic used to read "bp 128/0".
      bpAverageLabel(j) ? `bp ${bpAverageLabel(j)}` : null,
      avg(h.map(e => e.recovery_score as number | null)) != null ? `recovery ${roundTo(avg(h.map(e => e.recovery_score as number | null))!)}%` : null,
      avg(h.map(e => e.sleep_total_min as number | null)) != null ? `sleep ${Math.round(avg(h.map(e => e.sleep_total_min as number | null))!)}min` : null,
      `${wo.length} workouts`,
      sodaText(j.flatMap(e => e.sodas ?? []), 'sodas', estimates),
      waterText(j),
      foodText(j, estimates)
    ].filter(Boolean)
    lines.push(`${start} → ${end}: ${parts.join(', ')}`)
  }
  return lines
}

/** Recent daily detail: vitals, doses, notes — where the fine-grained questions live. */
function dailyLines(journal: JournalRow[], health: Array<Record<string, unknown>>, since: string, estimates: EstimateIndex): string[] {
  const byDate = new Map(health.map(h => [h.date as string, h]))
  return journal
    .filter(e => e.date >= since)
    .map((e) => {
      const h = byDate.get(e.date)
      const doses = (e.peptides ?? []).map(p => `${p.compound} ${p.dose}${p.unit}`).join(' + ')
      const parts = [
        e.weight_lbs != null ? `${e.weight_lbs}lbs` : null,
        bpLabel(e) ? `bp ${bpLabel(e)}` : null,
        e.rhr != null ? `rhr ${e.rhr}` : null,
        e.hrv != null ? `hrv ${e.hrv}` : null,
        h?.recovery_score != null ? `recovery ${h.recovery_score}%` : null,
        h?.sleep_total_min != null ? `sleep ${h.sleep_total_min}min` : null,
        doses ? `doses: ${doses}` : 'no doses',
        e.sodas?.length ? sodaText(e.sodas, 'soda', estimates) : null,
        hydrationOz(e) ? `water ${hydrationOz(e)} oz` : null,
        mealsText(e, estimates),
        e.notes?.trim() ? `note: "${e.notes.trim().replace(/\s*\n+\s*/g, ' / ').slice(0, 200)}"` : null
      ].filter(Boolean)
      return `${e.date}: ${parts.join(', ')}`
    })
}

/**
 * Wallet-card facts (blood type, …) — looked up, never trended. '' when none, or on a database
 * without the table yet; any other failure propagates rather than reading as "no facts on file"
 * (audit #42 item 31).
 */
async function profileLine(db: D1Database): Promise<string> {
  try {
    const { results } = await db.prepare('SELECT key, value FROM profile').all<{ key: string, value: string }>()
    const rows = results ?? []
    return rows.length ? `Personal facts on file: ${rows.map(r => `${profileLabel(r.key)} ${r.value}`).join('; ')}.` : ''
  }
  catch (err) {
    if (isMissingTable(err)) return ''
    throw err
  }
}

const DAILY_WINDOW_DAYS = 35
const WEEKLY_WINDOW_WEEKS = 20

/** The full fact sheet. `today` as YYYY-MM-DD in the reader's timezone; `protocol` the request's
 * schedule (protocolFor), which decides which compounds count as standing for the trend anchors. */
export async function buildAskContext(db: D1Database, today: string, protocol: ProtocolData): Promise<string> {
  const [journal, labs, dexa, vials, healthRes, workoutsRes, supplements, cyclesCtx, vaccines, profile, plannedDraws, phlebotomies, estimates, goals, accutane, protocolChange, pgx] = await Promise.all([
    journalRows(db),
    labLines(db),
    dexaLines(db),
    vialLines(db),
    db.prepare('SELECT date, recovery_score, strain, sleep_total_min FROM health_metrics ORDER BY date ASC').all(),
    // Full rows: parseWorkoutRow/mergeWorkouts need external_id and start_time for dedup.
    db.prepare('SELECT * FROM workouts ORDER BY date ASC').all(),
    supplementContext(db, today),
    cycleContext(db, today),
    // Whole immunization record, not just recent shots — "when was my last tetanus?" lives here.
    vaccineContext(db, today, 'all'),
    profileLine(db),
    // The next booked draw and its questions — "when's my next draw?" and "what am I waiting on?".
    plannedDrawContext(db, today),
    // Blood taken out on purpose (audit #43 item 59): the reason a hematocrit fell, and iron lost.
    phlebotomyContext(db, today),
    // Meal figures (library, hand entries, model estimates) for the meals in the day and week lines.
    loadEstimateIndex(db),
    // The dated marker goals and their verdicts (audit #43 item 60): "is Primo a go?" is answered
    // from these, not inferred.
    markerGoalsContext(db, today, protocol),
    // The isotretinoin course as it stands (item 97): cumulative mg, mg/kg, the lipid window.
    accutaneContext(db, today),
    // The vitals since the latest core dose change (item 67): "what did the hCG cut do?" is
    // answered from these numbers, not re-derived from the log.
    loadCycles(db).then(cycles => protocolChangeContext(db, today, mergeRules(protocol.rules, cycles))),
    // The hand-entered drug-gene notes (item 78): "will tamoxifen work for me?" has its answer here.
    pgxContext(db)
  ])
  const health = (healthRes.results ?? []) as Array<Record<string, unknown>>
  const workouts = mergeWorkouts((workoutsRes.results ?? []).map(parseWorkoutRow)) as unknown as Array<Record<string, unknown>>

  // Sustained-shift findings + protocol change-points, same math the digests lean on.
  const trendStart = shiftDays(today, -119)
  const trends = computeTrends(
    journal.filter(e => e.date >= trendStart),
    health.filter(h => (h.date as string) >= trendStart) as never,
    today,
    protocol.rules,
    protocol.standing
  )
  const trendLines = formatTrendLines(trends, today, protocol.rules)

  const recentWorkouts = workouts
    .filter(w => (w.date as string) >= shiftDays(today, -DAILY_WINDOW_DAYS))
    .map(w => `${w.date}: ${w.workout_type ?? 'Workout'}${w.duration_min != null ? ` ${w.duration_min}min` : ''}${w.calories != null ? ` ${w.calories}kcal` : ''}${w.avg_hr != null ? ` avgHR ${w.avg_hr}` : ''}${w.strain != null ? ` strain ${w.strain}` : ''}${Array.isArray(w.hr_zones) ? ` zones(min) z0–z5 ${(w.hr_zones as number[]).join('/')}` : ''}`)

  // The trend weight and its rate (shared/utils/weightTrend.ts) — the same figures the tiles and
  // digests show, so "am I gaining?" is answered from the trend, not from two scale readings.
  const weightNow = describeTrend(weightTrend(weighInsOf(journal), today))

  const sections = [
    `Today is ${today}.`,
    weightNow ? `Weight now: ${weightNow} — the trend is the gap-aware EMA of the weigh-ins, the rate the 14-day slope; prefer these to single-day readings.` : '',
    profile,
    supplements,
    cyclesCtx,
    protocolChange,
    accutane,
    goals,
    pgx,
    vaccines,
    eventContext(today, PROTOCOL_EVENTS),
    plannedDraws,
    phlebotomies,
    `Lab draws (every draw on file; marker keys are snake_case, standard US lab units):\n${labs.join('\n') || 'none'}`,
    `DEXA scans:\n${dexa.join('\n') || 'none'}`,
    `Compound history (all-time, from the dose log):\n${compoundLines(journal).join('\n') || 'none'}`,
    `Reconstitutions (every vial mixed, from the journal; concentration is vial content over BAC water):\n${reconstitutionLines(journal).join('\n') || 'none logged'}`,
    vials.length ? `Vial inventory (/tools/inventory; "active" is open and being drawn from):\n${vials.join('\n')}` : '',
    trendLines.length ? `Sustained trends (precomputed multi-week shifts):\n${trendLines.join('\n')}` : '',
    'Meal figures: label figures for known meals, otherwise model estimates from the meal text (about ±25 % per meal). A day marked "floor" has a meal with no figures. Treat them as trend and protein adequacy, not measured intake.',
    `Weekly aggregates, last ${WEEKLY_WINDOW_WEEKS} weeks:\n${weeklyLines(journal, health, workouts, today, WEEKLY_WINDOW_WEEKS, estimates).join('\n') || 'none'}`,
    `Daily detail, last ${DAILY_WINDOW_DAYS} days:\n${dailyLines(journal, health, shiftDays(today, -DAILY_WINDOW_DAYS), estimates).join('\n') || 'none'}`,
    `Recent workouts (last ${DAILY_WINDOW_DAYS} days; merged Apple+Whoop):\n${recentWorkouts.join('\n') || 'none'}`
  ]
  return sections.filter(Boolean).join('\n\n')
}
