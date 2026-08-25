// Standing fact sheet for the ask-the-data chat: a bounded plain-text snapshot of everything
// the site tracks, rebuilt per request straight from D1. Unlike the digest builders (which
// summarize one period), this favors breadth — every lab draw, every DEXA scan, the whole
// dose history in aggregate — with full daily detail only for the recent window, so arbitrary
// questions can be answered without shipping 1,200 journal rows into the prompt.

interface Dose { compound: string, dose: number, unit: string }

interface JournalRow {
  date: string
  weight_lbs: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  rhr: number | null
  hrv: number | null
  peptides: Dose[]
  sodas: unknown[]
  notes: string | null
}

function shiftDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function avg(vals: Array<number | null | undefined>): number | null {
  const nums = vals.filter((v): v is number => v != null && !Number.isNaN(v))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

async function journalRows(db: D1Database, since?: string): Promise<JournalRow[]> {
  const sql = `SELECT date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides, sodas, notes
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
    notes: (r.notes as string | null) ?? null
  }))
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
      `${name}: ${v.first} → ${v.last}, ${v.days.size} days, avg ${round(v.total / v.days.size, 2)}${v.unit}/day used`
    )
}

/** Trailing weekly aggregates so month-scale questions don't need day rows. */
function weeklyLines(journal: JournalRow[], health: Array<Record<string, unknown>>, workouts: Array<Record<string, unknown>>, today: string, weeks: number): string[] {
  const lines: string[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const end = shiftDays(today, -7 * w)
    const start = shiftDays(end, -6)
    const j = journal.filter(e => e.date >= start && e.date <= end)
    const h = health.filter(e => (e.date as string) >= start && (e.date as string) <= end)
    const wo = workouts.filter(e => (e.date as string) >= start && (e.date as string) <= end)
    if (!j.length && !h.length && !wo.length) continue
    const parts = [
      avg(j.map(e => e.weight_lbs)) != null ? `weight ${round(avg(j.map(e => e.weight_lbs))!)}` : null,
      avg(j.map(e => e.rhr)) != null ? `rhr ${round(avg(j.map(e => e.rhr))!)}` : null,
      avg(j.map(e => e.hrv)) != null ? `hrv ${round(avg(j.map(e => e.hrv))!)}` : null,
      avg(j.map(e => e.bp_systolic)) != null ? `bp ${Math.round(avg(j.map(e => e.bp_systolic))!)}/${Math.round(avg(j.map(e => e.bp_diastolic))! || 0)}` : null,
      avg(h.map(e => e.recovery_score as number | null)) != null ? `recovery ${round(avg(h.map(e => e.recovery_score as number | null))!)}%` : null,
      avg(h.map(e => e.sleep_total_min as number | null)) != null ? `sleep ${Math.round(avg(h.map(e => e.sleep_total_min as number | null))!)}min` : null,
      `${wo.length} workouts`,
      `${j.reduce((s, e) => s + (e.sodas?.length ?? 0), 0)} sodas`
    ].filter(Boolean)
    lines.push(`${start} → ${end}: ${parts.join(', ')}`)
  }
  return lines
}

/** Recent daily detail: vitals, doses, notes — where the fine-grained questions live. */
function dailyLines(journal: JournalRow[], health: Array<Record<string, unknown>>, since: string): string[] {
  const byDate = new Map(health.map(h => [h.date as string, h]))
  return journal
    .filter(e => e.date >= since)
    .map((e) => {
      const h = byDate.get(e.date)
      const doses = (e.peptides ?? []).map(p => `${p.compound} ${p.dose}${p.unit}`).join(' + ')
      const parts = [
        e.weight_lbs != null ? `${e.weight_lbs}lbs` : null,
        e.bp_systolic != null ? `bp ${e.bp_systolic}/${e.bp_diastolic}` : null,
        e.rhr != null ? `rhr ${e.rhr}` : null,
        e.hrv != null ? `hrv ${e.hrv}` : null,
        h?.recovery_score != null ? `recovery ${h.recovery_score}%` : null,
        h?.sleep_total_min != null ? `sleep ${h.sleep_total_min}min` : null,
        doses ? `doses: ${doses}` : 'no doses',
        e.sodas?.length ? `${e.sodas.length} soda` : null,
        e.notes?.trim() ? `note: "${e.notes.trim().replace(/\s*\n+\s*/g, ' / ').slice(0, 200)}"` : null
      ].filter(Boolean)
      return `${e.date}: ${parts.join(', ')}`
    })
}

const DAILY_WINDOW_DAYS = 35
const WEEKLY_WINDOW_WEEKS = 20

/** The full fact sheet. `today` as YYYY-MM-DD in the reader's timezone. */
export async function buildAskContext(db: D1Database, today: string): Promise<string> {
  const [journal, labs, dexa, healthRes, workoutsRes, supplements] = await Promise.all([
    journalRows(db),
    labLines(db),
    dexaLines(db),
    db.prepare('SELECT date, recovery_score, strain, sleep_total_min FROM health_metrics ORDER BY date ASC').all(),
    // Full rows: parseWorkoutRow/mergeWorkouts need external_id and start_time for dedup.
    db.prepare('SELECT * FROM workouts ORDER BY date ASC').all(),
    supplementContext(db, today)
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
    supplements,
    `Lab draws (every draw on file; marker keys are snake_case, standard US lab units):\n${labs.join('\n') || 'none'}`,
    `DEXA scans:\n${dexa.join('\n') || 'none'}`,
    `Compound history (all-time, from the dose log):\n${compoundLines(journal).join('\n') || 'none'}`,
    trendLines.length ? `Sustained trends (precomputed multi-week shifts):\n${trendLines.join('\n')}` : '',
    `Weekly aggregates, last ${WEEKLY_WINDOW_WEEKS} weeks:\n${weeklyLines(journal, health, workouts, today, WEEKLY_WINDOW_WEEKS).join('\n') || 'none'}`,
    `Daily detail, last ${DAILY_WINDOW_DAYS} days:\n${dailyLines(journal, health, shiftDays(today, -DAILY_WINDOW_DAYS)).join('\n') || 'none'}`,
    `Recent workouts (last ${DAILY_WINDOW_DAYS} days; merged Apple+Whoop):\n${recentWorkouts.join('\n') || 'none'}`
  ]
  return sections.filter(Boolean).join('\n\n')
}
