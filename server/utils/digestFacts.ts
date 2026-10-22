import type { ProtocolRule } from '#shared/utils/protocolRules'
import { fmtDay, scheduleContext } from '#shared/utils/protocolProse'
import { roundTo, shiftDays } from '#shared/utils/dates'
import { mean } from '#shared/utils/stats'
import { computeTrends, formatTrendLines, type TrendFinding } from '#shared/utils/trends'
import { fmtSodaOz, sodaTotals, type SodaTotals } from '#shared/utils/soda'
import { fmtWaterOz, waterTotals } from '#shared/utils/water'
import { bpLabel } from '#shared/utils/bloodPressure'
import { MEAL_SLOTS, MEAL_SLOT_LABELS, dayNutrition, mealHistory, type EstimateIndex } from '#shared/utils/nutrition'
import type { HealthMetricsEntry, JournalRow, SodaEntry, WorkoutEntry } from '#shared/types/journal'

// The digest's fact sheet: reads a period's vitals / sleep / recovery / doses / workouts from D1
// and renders them as the plain lines the prompt hands the model (digestPrompts.ts), plus the
// stats stored beside the recap. Every number the model cites is computed here, not by it.

function fmtDuration(min: number): string {
  // Round the total BEFORE splitting: floor/round separately turned a weekly average of 419.7
  // into "6h 60m" — in the AI prompt, no less.
  const total = Math.round(min)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

const avg = mean

// compound → the dates it was logged, the shape tallySchedule scores against.
function doseDatesOf(entries: JournalRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const e of entries) {
    for (const p of e.peptides ?? []) {
      if (!p.compound) continue
      let set = map.get(p.compound)
      if (!set) map.set(p.compound, set = new Set())
      set.add(e.date)
    }
  }
  return map
}

// --- D1 reads ---

// The columns the digest reads (see the SELECTs below).
type HealthRow = Pick<HealthMetricsEntry,
  'date' | 'recovery_score' | 'strain' | 'sleep_total_min' | 'sleep_performance_pct'
  | 'sleep_deep_min' | 'sleep_rem_min' | 'body_fat_pct' | 'lean_body_mass_lbs'>
type WorkoutRow = Pick<WorkoutEntry, 'date' | 'workout_type' | 'duration_min' | 'calories' | 'avg_hr'>

const JOURNAL_COLS = 'date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides, sodas, water, food, notes'

// Rows are parsed by server/utils/db.ts parseJournalRow — the one copy. This file carried its own
// (notes null instead of '', no reconstitutions) until audit #42 item 40.

/**
 * The period's meal log against the figures (library, hand entries, model estimates): how many
 * days logged food, kcal and protein per day over the days whose meals ALL have figures (a
 * half-covered day reads low), and the three most-logged meals.
 */
function foodSummary(entries: JournalRow[], estimates: EstimateIndex) {
  const days = entries.filter(e => MEAL_SLOTS.some(s => e.food?.[s]?.trim()))
  let covered = 0
  let kcal = 0
  let protein = 0
  for (const e of days) {
    const n = dayNutrition(e, estimates)
    if (!n.meals.length || n.missing.length) continue
    covered++
    kcal += n.kcal
    protein += n.protein_g
  }
  const top = mealHistory(days).slice(0, 3).map(h => (h.count > 1 ? `${h.text} ×${h.count}` : h.text))
  return {
    daysLogged: days.length,
    daysCovered: covered,
    kcal: covered ? Math.round(kcal / covered) : 0,
    protein_g: covered ? Math.round(protein / covered) : 0,
    top
  }
}

/** Days of a range that logged any water, and the oz/day over just those days — unlogged days are unknown, not zero. */
function waterSummary(entries: JournalRow[]): { days: number, oz: number, perDay: number } {
  const days = entries.filter(e => (e.water?.length ?? 0) > 0).length
  const { oz } = waterTotals(entries.flatMap(e => e.water ?? []))
  return { days, oz, perDay: days ? Math.round(oz / days) : 0 }
}

async function journalInRange(db: D1Database, start: string, end: string): Promise<JournalRow[]> {
  const { results } = await db.prepare(
    `SELECT ${JOURNAL_COLS} FROM journal_entries WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC`
  ).bind(start, end).all()
  return (results ?? []).map(parseJournalRow)
}

async function healthInRange(db: D1Database, start: string, end: string): Promise<HealthRow[]> {
  const { results } = await db.prepare(
    'SELECT date, recovery_score, strain, sleep_total_min, sleep_performance_pct, sleep_deep_min, sleep_rem_min, body_fat_pct, lean_body_mass_lbs FROM health_metrics WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC'
  ).bind(start, end).all()
  return (results ?? []).map(r => ({
    date: r.date as string,
    recovery_score: (r.recovery_score as number | null) ?? null,
    strain: (r.strain as number | null) ?? null,
    sleep_total_min: (r.sleep_total_min as number | null) ?? null,
    sleep_performance_pct: (r.sleep_performance_pct as number | null) ?? null,
    sleep_deep_min: (r.sleep_deep_min as number | null) ?? null,
    sleep_rem_min: (r.sleep_rem_min as number | null) ?? null,
    body_fat_pct: (r.body_fat_pct as number | null) ?? null,
    lean_body_mass_lbs: (r.lean_body_mass_lbs as number | null) ?? null
  }))
}

async function workoutsInRange(db: D1Database, start: string, end: string): Promise<WorkoutRow[]> {
  const { results } = await db.prepare(
    'SELECT * FROM workouts WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC'
  ).bind(start, end).all()
  // Merge Whoop/Apple/Peloton recordings of the same session so counts and totals aren't inflated.
  return mergeWorkouts((results ?? []).map(parseWorkoutRow))
}

// The most recent weigh-in strictly before `date`, for the weight delta — a row WITH a weight,
// not merely the previous row: a soda or water tap creates a journal row with no vitals, and
// reading that as "the prior entry" lost the delta whenever yesterday was tap-only (audit #42
// item 13). The delta line names the day it compares against, so a weigh-in from several days
// back reads honestly.
async function priorWeighIn(db: D1Database, date: string): Promise<{ date: string, weight_lbs: number } | null> {
  const row = await db.prepare(
    'SELECT date, weight_lbs FROM journal_entries WHERE date < ?1 AND weight_lbs IS NOT NULL ORDER BY date DESC LIMIT 1'
  ).bind(date).first<{ date: string, weight_lbs: number }>()
  return row ?? null
}

// Dates of lab draws inside the period, so the digest can point at fresh results.
async function labDatesInRange(db: D1Database, start: string, end: string): Promise<string[]> {
  const { results } = await db.prepare(
    'SELECT date FROM labs_entries WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC'
  ).bind(start, end).all()
  return (results ?? []).map(r => r.date as string)
}

// --- line helpers ---

// "5 (coke zero x3, dr pepper x2)" plus ounces — freeform drink names are normalized
// (trim/lowercase) before counting so near-duplicate spellings don't split the tally, and the
// size labels are parsed for volume (shared/utils/soda.ts) because ounces, not count, is the
// number that tracks the goal.
function sodaSummary(entries: JournalRow[]): SodaTotals & { breakdown: string } {
  const byDrink = new Map<string, { label: string, n: number }>()
  const all: SodaEntry[] = []
  for (const e of entries) {
    for (const s of e.sodas ?? []) {
      all.push(s)
      const label = (s.drink ?? 'unspecified').trim() || 'unspecified'
      const key = label.toLowerCase()
      const cur = byDrink.get(key) ?? { label, n: 0 }
      cur.n++
      byDrink.set(key, cur)
    }
  }
  const breakdown = [...byDrink.values()].sort((a, b) => b.n - a.n).map(d => d.n > 1 ? `${d.label} x${d.n}` : d.label).join(', ')
  return { ...sodaTotals(all), breakdown }
}

// "2, ~15 oz (Sprite, Cherry Coke)"; over several days also "~24 oz/day".
function sodaLine(s: SodaTotals & { breakdown: string }, days = 1): string {
  const oz = fmtSodaOz(s)
  const perDay = days > 1 && s.oz ? `, ~${Math.round(s.oz / days)} oz/day` : ''
  return `${s.count}${oz ? `, ${oz}${perDay}` : ''} (${s.breakdown})`
}

// Dated journal notes as one fact-sheet line; notes are freeform so newlines are flattened
// and each is capped to keep the prompt bounded.
function noteLines(entries: JournalRow[]): string[] {
  return entries
    .filter(e => e.notes?.trim())
    .map((e) => {
      const flat = e.notes!.trim().replace(/\s*\n+\s*/g, ' / ')
      return `${fmtDay(e.date)}: "${flat.length > 280 ? flat.slice(0, 277) + '...' : flat}"`
    })
}

function tallyDoses(entries: JournalRow[]) {
  const map = new Map<string, { days: Set<string>, total: number, unit: string }>()
  for (const e of entries) {
    for (const p of e.peptides ?? []) {
      if (!p.compound) continue
      const cur = map.get(p.compound) ?? { days: new Set<string>(), total: 0, unit: p.unit }
      cur.days.add(e.date)
      cur.total += p.dose
      map.set(p.compound, cur)
    }
  }
  return [...map.entries()]
    .map(([compound, v]) => ({ compound, days: v.days.size, total: roundTo(v.total, 2), unit: v.unit }))
    .sort((a, b) => b.days - a.days)
}

export interface DigestFacts {
  lines: string[]
  stats: Record<string, unknown>
  /** Whether the period has anything worth a recap; baselines and schedule lines don't count. */
  hasData: boolean
}

// --- Daily ---

// `rules` is the effective dosing schedule (standing + planned cycles) and `today` the
// home-timezone date, both for the schedule check — see scheduleContext in protocolProse.ts.
export async function dailyDigestFacts(db: D1Database, date: string, rules: ProtocolRule[], today: string): Promise<DigestFacts> {
  const [journal, health, workouts, prev, baseJournal, baseHealth, labDates, estimates] = await Promise.all([
    journalInRange(db, date, date),
    healthInRange(db, date, date),
    workoutsInRange(db, date, date),
    priorWeighIn(db, date),
    journalInRange(db, shiftDays(date, -7), shiftDays(date, -1)),
    healthInRange(db, shiftDays(date, -7), shiftDays(date, -1)),
    labDatesInRange(db, date, date),
    loadEstimateIndex(db)
  ])
  const entry = journal[0] ?? null
  const h = health[0] ?? null

  const lines: string[] = []
  if (entry?.weight_lbs != null) {
    const delta = prev?.weight_lbs != null ? ` (${entry.weight_lbs - prev.weight_lbs >= 0 ? '+' : ''}${roundTo(entry.weight_lbs - prev.weight_lbs)} vs ${fmtDay(prev.date)})` : ''
    lines.push(`Weight: ${entry.weight_lbs} lbs${delta}`)
  }
  const bp = bpLabel(entry)
  if (bp) lines.push(`Blood pressure: ${bp}`)
  if (entry?.rhr != null) lines.push(`Resting HR: ${entry.rhr} bpm`)
  if (entry?.hrv != null) lines.push(`HRV: ${entry.hrv} ms`)
  if (h?.recovery_score != null) lines.push(`Whoop recovery: ${h.recovery_score}%`)
  if (h?.strain != null) lines.push(`Whoop strain: ${roundTo(h.strain)}`)
  if (h?.sleep_total_min != null) {
    const stages = [
      h.sleep_deep_min != null ? `${fmtDuration(h.sleep_deep_min)} deep` : null,
      h.sleep_rem_min != null ? `${fmtDuration(h.sleep_rem_min)} REM` : null
    ].filter(Boolean)
    lines.push(`Sleep: ${fmtDuration(h.sleep_total_min)}${h.sleep_performance_pct != null ? ` (${h.sleep_performance_pct}% performance)` : ''}${stages.length ? ` — ${stages.join(', ')}` : ''}`)
  }

  const doses = (entry?.peptides ?? []).map(p => `${p.compound} ${p.dose}${p.unit}`)
  if (doses.length) lines.push(`Doses logged: ${doses.join(', ')}`)
  else lines.push('Doses logged: none')

  if (workouts.length) {
    lines.push(`Workouts: ${workouts.map(w => `${w.workout_type ?? 'Workout'}${w.duration_min != null ? ` ${w.duration_min}min` : ''}${w.calories != null ? ` ${w.calories}kcal` : ''}`).join('; ')}`)
  }

  const sodas = sodaSummary(journal)
  if (sodas.count) lines.push(`Sodas: ${sodaLine(sodas)}`)

  const water = waterTotals(entry?.water)
  if (water.count) lines.push(`Water: ${fmtWaterOz(water.oz)} over ${water.count} pour${water.count === 1 ? '' : 's'}`)

  // The meals as typed, then the day's total — a floor while any meal has no figures.
  const mealSlots = MEAL_SLOTS.filter(s => entry?.food?.[s]?.trim())
  const nutrition = dayNutrition(entry, estimates)
  if (mealSlots.length) {
    const list = mealSlots.map(s => `${MEAL_SLOT_LABELS[s].toLowerCase()} — ${entry!.food[s]!.trim()}`).join('; ')
    const missing = nutrition.missing.length
    const allLabel = nutrition.meals.every(m => !m.estimate || m.estimate.source !== 'ai')
    const figures = nutrition.estimated
      ? ` ${allLabel ? 'Label figures' : 'Est.'} ≈ ${Math.round(nutrition.kcal)} kcal, ${Math.round(nutrition.protein_g)} g protein, ${Math.round(nutrition.carbs_g)} g carbs, ${Math.round(nutrition.fat_g)} g fat`
      + `${nutrition.sodaKcal ? ` (incl. ~${nutrition.sodaKcal} kcal from soda)` : ''}`
      + `${missing ? `; ${missing} meal${missing === 1 ? '' : 's'} without figures yet, so this is a floor` : ''}.`
      : ''
    lines.push(`Meals: ${list}.${figures}`)
  }

  const notes = noteLines(journal)
  if (notes.length) lines.push(`Your note for the day — ${notes.join('; ')}`)

  if (labDates.length) lines.push('Labs were drawn this day — results are on the labs page.')

  const stats = {
    weight_lbs: entry?.weight_lbs ?? null,
    rhr: entry?.rhr ?? null,
    hrv: entry?.hrv ?? null,
    recovery: h?.recovery_score ?? null,
    strain: h?.strain != null ? roundTo(h.strain) : null,
    sleep_min: h?.sleep_total_min ?? null,
    doses: doses.length,
    workouts: workouts.length,
    sodas: sodas.count,
    soda_oz: sodas.oz || null,
    water_oz: water.oz || null,
    kcal_est: nutrition.estimated ? Math.round(nutrition.kcal) : null,
    protein_g_est: nutrition.estimated ? Math.round(nutrition.protein_g) : null
  }

  // Baseline is context, not data — decide whether the day is worth summarizing first.
  // The gaps endpoint (server/api/journal/digest/gaps.get.ts) mirrors these signals in SQL so
  // "fill gaps" never offers a day this line would skip — change one, change both.
  const hasData = lines.length > 1 || doses.length > 0 || workouts.length > 0

  // Planned vs logged, with the weekday already resolved — pushed after the hasData decision
  // because it says something even on an empty day.
  const schedule = scheduleContext(rules, date, date, doseDatesOf(journal), today)
  if (schedule) lines.push(schedule)

  const base: string[] = []
  const bWeight = avg(baseJournal.map(e => e.weight_lbs!))
  if (bWeight != null) base.push(`avg weight ${roundTo(bWeight)} lbs`)
  const bRhr = avg(baseJournal.map(e => e.rhr!))
  if (bRhr != null) base.push(`avg resting HR ${roundTo(bRhr)} bpm`)
  const bHrv = avg(baseJournal.map(e => e.hrv!))
  if (bHrv != null) base.push(`avg HRV ${roundTo(bHrv)} ms`)
  const bRec = avg(baseHealth.map(x => x.recovery_score!))
  if (bRec != null) base.push(`avg recovery ${roundTo(bRec)}%`)
  const bSleep = avg(baseHealth.map(x => x.sleep_total_min!))
  if (bSleep != null) base.push(`avg sleep ${fmtDuration(bSleep)}`)
  if (base.length) lines.push(`Prior 7 days, for comparison: ${base.join(', ')}`)

  return { lines, stats, hasData }
}

// --- Weekly ---

export async function weeklyDigestFacts(db: D1Database, start: string, end: string, rules: ProtocolRule[], today: string): Promise<DigestFacts> {
  const prevStart = shiftDays(start, -7)
  const prevEnd = shiftDays(start, -1)
  const [journal, health, workouts, prevJournal, prevHealth, prevWorkouts, labDates, estimates] = await Promise.all([
    journalInRange(db, start, end),
    healthInRange(db, start, end),
    workoutsInRange(db, start, end),
    journalInRange(db, prevStart, prevEnd),
    healthInRange(db, prevStart, prevEnd),
    workoutsInRange(db, prevStart, prevEnd),
    labDatesInRange(db, start, end),
    loadEstimateIndex(db)
  ])

  const weights = journal.map(e => e.weight_lbs).filter((v): v is number => v != null)
  const lines: string[] = []
  if (weights.length) {
    const first = weights[0]!
    const last = weights[weights.length - 1]!
    lines.push(`Weight: ${last} lbs now (${last - first >= 0 ? '+' : ''}${roundTo(last - first)} over the week), avg ${roundTo(avg(weights)!)}, range ${Math.min(...weights)}–${Math.max(...weights)}`)
  }
  const rhr = avg(journal.map(e => e.rhr!).filter(v => v != null))
  if (rhr != null) lines.push(`Avg resting HR: ${roundTo(rhr)} bpm`)
  const hrv = avg(journal.map(e => e.hrv!).filter(v => v != null))
  if (hrv != null) lines.push(`Avg HRV: ${roundTo(hrv)} ms`)

  const sysVals = journal.map(e => e.bp_systolic).filter((v): v is number => v != null)
  const diaVals = journal.map(e => e.bp_diastolic).filter((v): v is number => v != null)
  const bpSys = avg(sysVals)
  const bpDia = avg(diaVals)
  if (bpSys != null && bpDia != null) {
    lines.push(`Avg blood pressure: ${Math.round(bpSys)}/${Math.round(bpDia)} (systolic range ${Math.min(...sysVals)}–${Math.max(...sysVals)}, ${sysVals.length} readings)`)
  }

  const rec = avg(health.map(h => h.recovery_score!).filter(v => v != null))
  if (rec != null) lines.push(`Avg Whoop recovery: ${roundTo(rec)}%`)
  const strain = avg(health.map(h => h.strain!).filter(v => v != null))
  if (strain != null) lines.push(`Avg Whoop strain: ${roundTo(strain)}`)
  const sleep = avg(health.map(h => h.sleep_total_min!).filter(v => v != null))
  if (sleep != null) {
    const deep = avg(health.map(h => h.sleep_deep_min!))
    const rem = avg(health.map(h => h.sleep_rem_min!))
    const stages = [
      deep != null ? `${fmtDuration(deep)} deep` : null,
      rem != null ? `${fmtDuration(rem)} REM` : null
    ].filter(Boolean)
    lines.push(`Avg sleep: ${fmtDuration(sleep)}/night${stages.length ? ` (${stages.join(', ')})` : ''}`)
  }

  const fat = avg(health.map(h => h.body_fat_pct!))
  const lean = avg(health.map(h => h.lean_body_mass_lbs!))
  if (fat != null || lean != null) {
    const parts = [
      fat != null ? `avg body fat ${roundTo(fat)}%` : null,
      lean != null ? `avg lean mass ${roundTo(lean)} lbs` : null
    ].filter(Boolean)
    lines.push(`Body composition (scale): ${parts.join(', ')}`)
  }

  const doses = tallyDoses(journal)
  if (doses.length) {
    lines.push(`Compounds used: ${doses.map(d => `${d.compound} (${d.days}d, ${d.total}${d.unit} total)`).join('; ')}`)
  }
  else lines.push('Compounds used: none logged')

  // Planned vs logged per compound, dates already resolved to weekdays.
  const schedule = scheduleContext(rules, start, end, doseDatesOf(journal), today)
  if (schedule) lines.push(schedule)

  if (workouts.length) {
    const totalMin = workouts.reduce((s, w) => s + (w.duration_min ?? 0), 0)
    const totalCal = workouts.reduce((s, w) => s + (w.calories ?? 0), 0)
    lines.push(`Workouts: ${workouts.length} sessions, ${roundTo(totalMin)} min total${totalCal ? `, ${Math.round(totalCal)} kcal` : ''}`)
  }
  else lines.push('Workouts: none')

  const sodas = sodaSummary(journal)
  lines.push(sodas.count ? `Sodas: ${sodaLine(sodas, 7)}` : 'Sodas: none logged')

  const water = waterSummary(journal)
  lines.push(water.days
    ? `Water: ~${water.perDay} oz/day over the ${water.days} day${water.days === 1 ? '' : 's'} it was logged (${fmtWaterOz(water.oz)} total)`
    : 'Water: none logged')

  const food = foodSummary(journal, estimates)
  lines.push(food.daysLogged
    ? `Food: meals logged on ${food.daysLogged} day${food.daysLogged === 1 ? '' : 's'}`
    + `${food.daysCovered ? `; ≈ ${food.kcal} kcal/day and ${food.protein_g} g protein/day over the ${food.daysCovered} day${food.daysCovered === 1 ? '' : 's'} with figures for every meal` : ''}`
    + `${food.top.length ? `; most logged: ${food.top.join(', ')}` : ''}`
    : 'Food: no meals logged')

  const notes = noteLines(journal)
  if (notes.length) lines.push(`Your notes this week — ${notes.join('; ')}`)

  if (labDates.length) lines.push(`Labs drawn ${labDates.map(fmtDay).join(', ')} — results are on the labs page.`)

  // Previous-week baseline so "better/worse than a typical week" is grounded in numbers.
  const base: string[] = []
  const pRec = avg(prevHealth.map(h => h.recovery_score!))
  if (pRec != null) base.push(`avg recovery ${roundTo(pRec)}%`)
  const pSleep = avg(prevHealth.map(h => h.sleep_total_min!))
  if (pSleep != null) base.push(`avg sleep ${fmtDuration(pSleep)}/night`)
  const pRhr = avg(prevJournal.map(e => e.rhr!))
  if (pRhr != null) base.push(`avg resting HR ${roundTo(pRhr)} bpm`)
  const pHrv = avg(prevJournal.map(e => e.hrv!))
  if (pHrv != null) base.push(`avg HRV ${roundTo(pHrv)} ms`)
  const pSys = avg(prevJournal.map(e => e.bp_systolic!))
  const pDia = avg(prevJournal.map(e => e.bp_diastolic!))
  if (pSys != null && pDia != null) base.push(`avg BP ${Math.round(pSys)}/${Math.round(pDia)}`)
  const pWeights = prevJournal.map(e => e.weight_lbs).filter((v): v is number => v != null)
  if (pWeights.length) base.push(`avg weight ${roundTo(avg(pWeights)!)} lbs`)
  base.push(`${prevWorkouts.length} workout${prevWorkouts.length === 1 ? '' : 's'}`)
  const pSodas = sodaSummary(prevJournal)
  const pOz = fmtSodaOz(pSodas)
  base.push(`${pSodas.count} soda${pSodas.count === 1 ? '' : 's'}${pOz ? ` (${pOz})` : ''}`)
  const pWater = waterSummary(prevJournal)
  if (pWater.days) base.push(`water ~${pWater.perDay} oz/day`)
  const pFood = foodSummary(prevJournal, estimates)
  if (pFood.daysCovered) base.push(`≈ ${pFood.kcal} kcal/day, ${pFood.protein_g} g protein/day`)
  if (prevJournal.length || prevHealth.length || prevWorkouts.length) {
    lines.push(`Previous week (${fmtDay(prevStart)} – ${fmtDay(prevEnd)}), for comparison: ${base.join(', ')}`)
  }

  const stats = {
    weight_lbs: weights.at(-1) ?? null,
    weight_change: weights.length >= 2 ? roundTo(weights.at(-1)! - weights[0]!) : null,
    avg_recovery: rec != null ? roundTo(rec) : null,
    avg_strain: strain != null ? roundTo(strain) : null,
    avg_sleep_min: sleep != null ? Math.round(sleep) : null,
    avg_bp_systolic: bpSys != null ? Math.round(bpSys) : null,
    avg_bp_diastolic: bpDia != null ? Math.round(bpDia) : null,
    compounds: doses.length,
    workouts: workouts.length,
    sodas: sodas.count,
    soda_oz: sodas.oz || null,
    water_oz_per_day: water.days ? water.perDay : null,
    avg_kcal_est: food.daysCovered ? food.kcal : null,
    avg_protein_g_est: food.daysCovered ? food.protein_g : null
  }

  const hasData = journal.length > 0 || health.length > 0 || workouts.length > 0
  return { lines, stats, hasData }
}

// --- Long-horizon trends ---

// Protocol change-points and sustained metric shifts over the ~4 months ending `end`, so the
// recap can connect a month of elevated RHR to the TRT start instead of only seeing the
// period's own numbers.
export async function digestTrends(db: D1Database, end: string): Promise<{ lines: string[], findings: TrendFinding[] }> {
  const windowStart = shiftDays(end, -119)
  const [journal, health] = await Promise.all([
    journalInRange(db, windowStart, end),
    healthInRange(db, windowStart, end)
  ])
  const trends = computeTrends(journal, health, end)
  return { lines: formatTrendLines(trends, end), findings: trends.findings }
}
