// Standing fact sheet for the ask-the-data chat: a bounded plain-text snapshot of everything
// the site tracks, rebuilt per request straight from D1. Unlike the digest builders (which
// summarize one period), this favors breadth — every lab draw, every DEXA scan, the whole
// dose history in aggregate — with full daily detail only for the recent window, so arbitrary
// questions can be answered without shipping 1,200 journal rows into the prompt.
import { profileLabel } from '#shared/utils/profile'
import { fmtSodaOz, sodaTotals } from '#shared/utils/soda'
import { waterTotals } from '#shared/utils/water'
import { bpAverageLabel, bpLabel } from '#shared/utils/bloodPressure'
import { MEAL_SLOTS, MEAL_SLOT_LABELS, dayNutrition, type EstimateIndex } from '#shared/utils/nutrition'
import type { JournalRow, SodaEntry } from '#shared/types/journal'
import { roundTo, shiftDays } from '#shared/utils/dates'
import { computeTrends, formatTrendLines } from '#shared/utils/trends'
import { eventContext } from '#shared/utils/protocolEvents'

function avg(vals: Array<number | null | undefined>): number | null {
  const nums = vals.filter((v): v is number => v != null && !Number.isNaN(v))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

// "3 sodas (~27 oz)" — ounces alongside the count, since two mini cans read as "two" but are
// less soda than one 20 oz bottle (shared/utils/soda.ts).
function sodaText(sodas: SodaEntry[], noun: string): string {
  const t = sodaTotals(sodas)
  const oz = fmtSodaOz(t)
  return `${t.count} ${noun}${oz ? ` (${oz})` : ''}`
}

// "water ~84 oz/day (5 days logged)" — averaged over the days that logged any, since a day with
// no taps is unknown rather than zero. null when the window has none.
function waterText(entries: JournalRow[]): string | null {
  const days = entries.filter(e => (e.water?.length ?? 0) > 0).length
  if (!days) return null
  const { oz } = waterTotals(entries.flatMap(e => e.water ?? []))
  return `water ~${Math.round(oz / days)} oz/day (${days} day${days === 1 ? '' : 's'} logged)`
}

async function journalRows(db: D1Database, since?: string): Promise<JournalRow[]> {
  const sql = `SELECT date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides, sodas, water, food, notes
    FROM journal_entries ${since ? 'WHERE date >= ?1' : ''} ORDER BY date ASC`
  const stmt = since ? db.prepare(sql).bind(since) : db.prepare(sql)
  const { results } = await stmt.all()
  return (results ?? []).map(r => ({
    date: r.date as string,
    weight_lbs: (r.weight_lbs as number | null) ?? null,
    bp_systolic: (r.bp_systolic as number | null) ?? null,
    bp_diastolic: (r.bp_diastolic as number | null) ?? null,
    rhr: (r.rhr as number | null) ?? null,
    hrv: (r.hrv as number | null) ?? null,
    peptides: JSON.parse((r.peptides as string) || '[]'),
    sodas: JSON.parse((r.sodas as string) || '[]'),
    water: JSON.parse((r.water as string) || '[]'),
    food: JSON.parse((r.food as string) || '{}'),
    notes: (r.notes as string | null) ?? null
  }))
}

// "food ≈ 1,850 kcal/day, 95 g protein/day (4 days with figures)" over the days whose meals all
// have figures; null when none do.
function foodText(entries: JournalRow[], estimates: EstimateIndex): string | null {
  let days = 0
  let kcal = 0
  let protein = 0
  for (const e of entries) {
    const n = dayNutrition(e, estimates)
    if (!n.meals.length || n.missing.length) continue
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
      sodaText(j.flatMap(e => e.sodas ?? []), 'sodas'),
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
        e.sodas?.length ? sodaText(e.sodas, 'soda') : null,
        e.water?.length ? `water ${waterTotals(e.water).oz} oz` : null,
        mealsText(e, estimates),
        e.notes?.trim() ? `note: "${e.notes.trim().replace(/\s*\n+\s*/g, ' / ').slice(0, 200)}"` : null
      ].filter(Boolean)
      return `${e.date}: ${parts.join(', ')}`
    })
}

/** Wallet-card facts (blood type, …) — looked up, never trended. '' when none, or no table yet. */
async function profileLine(db: D1Database): Promise<string> {
  try {
    const { results } = await db.prepare('SELECT key, value FROM profile').all<{ key: string, value: string }>()
    const rows = results ?? []
    return rows.length ? `Personal facts on file: ${rows.map(r => `${profileLabel(r.key)} ${r.value}`).join('; ')}.` : ''
  }
  catch {
    return ''
  }
}

const DAILY_WINDOW_DAYS = 35
const WEEKLY_WINDOW_WEEKS = 20

/** The full fact sheet. `today` as YYYY-MM-DD in the reader's timezone. */
export async function buildAskContext(db: D1Database, today: string): Promise<string> {
  const [journal, labs, dexa, healthRes, workoutsRes, supplements, cyclesCtx, vaccines, profile, plannedDraws, estimates] = await Promise.all([
    journalRows(db),
    labLines(db),
    dexaLines(db),
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
    // Meal figures (library, hand entries, model estimates) for the meals in the day and week lines.
    loadEstimateIndex(db)
  ])
  const health = (healthRes.results ?? []) as Array<Record<string, unknown>>
  const workouts = mergeWorkouts((workoutsRes.results ?? []).map(parseWorkoutRow)) as unknown as Array<Record<string, unknown>>

  // Sustained-shift findings + protocol change-points, same math the digests lean on.
  const trendStart = shiftDays(today, -119)
  const trends = computeTrends(
    journal.filter(e => e.date >= trendStart),
    health.filter(h => (h.date as string) >= trendStart) as never,
    today
  )
  const trendLines = formatTrendLines(trends, today)

  const recentWorkouts = workouts
    .filter(w => (w.date as string) >= shiftDays(today, -DAILY_WINDOW_DAYS))
    .map(w => `${w.date}: ${w.workout_type ?? 'Workout'}${w.duration_min != null ? ` ${w.duration_min}min` : ''}${w.calories != null ? ` ${w.calories}kcal` : ''}${w.avg_hr != null ? ` avgHR ${w.avg_hr}` : ''}`)

  const sections = [
    `Today is ${today}.`,
    profile,
    supplements,
    cyclesCtx,
    vaccines,
    eventContext(today),
    plannedDraws,
    `Lab draws (every draw on file; marker keys are snake_case, standard US lab units):\n${labs.join('\n') || 'none'}`,
    `DEXA scans:\n${dexa.join('\n') || 'none'}`,
    `Compound history (all-time, from the dose log):\n${compoundLines(journal).join('\n') || 'none'}`,
    trendLines.length ? `Sustained trends (precomputed multi-week shifts):\n${trendLines.join('\n')}` : '',
    'Meal figures: label figures for known meals, otherwise model estimates from the meal text (about ±25 % per meal). A day marked "floor" has a meal with no figures. Treat them as trend and protein adequacy, not measured intake.',
    `Weekly aggregates, last ${WEEKLY_WINDOW_WEEKS} weeks:\n${weeklyLines(journal, health, workouts, today, WEEKLY_WINDOW_WEEKS, estimates).join('\n') || 'none'}`,
    `Daily detail, last ${DAILY_WINDOW_DAYS} days:\n${dailyLines(journal, health, shiftDays(today, -DAILY_WINDOW_DAYS), estimates).join('\n') || 'none'}`,
    `Recent workouts (last ${DAILY_WINDOW_DAYS} days; merged Apple+Whoop):\n${recentWorkouts.join('\n') || 'none'}`
  ]
  return sections.filter(Boolean).join('\n\n')
}
