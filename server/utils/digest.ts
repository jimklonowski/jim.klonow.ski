import Anthropic from '@anthropic-ai/sdk'

// Personal-health digest generation. Gathers vitals / sleep / recovery / doses / workouts for a
// period from D1, has Claude write a short plain-text recap, and upserts it into the digests table.
// Shared by the scheduled tasks (digest:daily, digest:weekly) and the on-demand generate endpoint.

const MODEL = 'claude-sonnet-5'

export type DigestKind = 'daily' | 'weekly'

interface Peptide { compound: string, dose: number, unit: string }

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

function avg(nums: number[]): number | null {
  const vals = nums.filter(n => n != null && !Number.isNaN(n))
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

interface JournalRow {
  date: string
  weight_lbs: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  rhr: number | null
  hrv: number | null
  peptides: Peptide[]
}

interface HealthRow {
  date: string
  recovery_score: number | null
  strain: number | null
  sleep_total_min: number | null
  sleep_performance_pct: number | null
}

interface WorkoutRow {
  date: string
  workout_type: string | null
  duration_min: number | null
  calories: number | null
  avg_hr: number | null
}

async function journalInRange(db: D1Database, start: string, end: string): Promise<JournalRow[]> {
  const { results } = await db.prepare(
    'SELECT date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides FROM journal_entries WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC'
  ).bind(start, end).all()
  return (results ?? []).map(r => ({
    date: r.date as string,
    weight_lbs: (r.weight_lbs as number | null) ?? null,
    bp_systolic: (r.bp_systolic as number | null) ?? null,
    bp_diastolic: (r.bp_diastolic as number | null) ?? null,
    rhr: (r.rhr as number | null) ?? null,
    hrv: (r.hrv as number | null) ?? null,
    peptides: JSON.parse((r.peptides as string) || '[]')
  }))
}

async function healthInRange(db: D1Database, start: string, end: string): Promise<HealthRow[]> {
  const { results } = await db.prepare(
    'SELECT date, recovery_score, strain, sleep_total_min, sleep_performance_pct FROM health_metrics WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC'
  ).bind(start, end).all()
  return (results ?? []).map(r => ({
    date: r.date as string,
    recovery_score: (r.recovery_score as number | null) ?? null,
    strain: (r.strain as number | null) ?? null,
    sleep_total_min: (r.sleep_total_min as number | null) ?? null,
    sleep_performance_pct: (r.sleep_performance_pct as number | null) ?? null
  }))
}

async function workoutsInRange(db: D1Database, start: string, end: string): Promise<WorkoutRow[]> {
  const { results } = await db.prepare(
    'SELECT * FROM workouts WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC'
  ).bind(start, end).all()
  // Merge Whoop/Apple/Peloton recordings of the same session so counts and totals aren't inflated.
  return mergeWorkouts((results ?? []).map(parseWorkoutRow))
}

// Most recent journal entry with a non-null weight/rhr/hrv strictly before `date`, for deltas.
async function priorJournal(db: D1Database, date: string): Promise<JournalRow | null> {
  const { results } = await db.prepare(
    'SELECT date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides FROM journal_entries WHERE date < ?1 ORDER BY date DESC LIMIT 1'
  ).bind(date).all()
  const r = results?.[0]
  if (!r) return null
  return {
    date: r.date as string,
    weight_lbs: (r.weight_lbs as number | null) ?? null,
    bp_systolic: (r.bp_systolic as number | null) ?? null,
    bp_diastolic: (r.bp_diastolic as number | null) ?? null,
    rhr: (r.rhr as number | null) ?? null,
    hrv: (r.hrv as number | null) ?? null,
    peptides: JSON.parse((r.peptides as string) || '[]')
  }
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
    .map(([compound, v]) => ({ compound, days: v.days.size, total: round(v.total, 2), unit: v.unit }))
    .sort((a, b) => b.days - a.days)
}

// --- Daily ---

async function buildDaily(db: D1Database, date: string) {
  const [journal, health, workouts, prev] = await Promise.all([
    journalInRange(db, date, date),
    healthInRange(db, date, date),
    workoutsInRange(db, date, date),
    priorJournal(db, date)
  ])
  const entry = journal[0] ?? null
  const h = health[0] ?? null

  const lines: string[] = []
  if (entry?.weight_lbs != null) {
    const delta = prev?.weight_lbs != null ? ` (${entry.weight_lbs - prev.weight_lbs >= 0 ? '+' : ''}${round(entry.weight_lbs - prev.weight_lbs)} vs ${fmtDate(prev.date)})` : ''
    lines.push(`Weight: ${entry.weight_lbs} lbs${delta}`)
  }
  if (entry?.bp_systolic != null && entry?.bp_diastolic != null) lines.push(`Blood pressure: ${entry.bp_systolic}/${entry.bp_diastolic}`)
  if (entry?.rhr != null) lines.push(`Resting HR: ${entry.rhr} bpm`)
  if (entry?.hrv != null) lines.push(`HRV: ${entry.hrv} ms`)
  if (h?.recovery_score != null) lines.push(`Whoop recovery: ${h.recovery_score}%`)
  if (h?.strain != null) lines.push(`Whoop strain: ${round(h.strain)}`)
  if (h?.sleep_total_min != null) lines.push(`Sleep: ${fmtDuration(h.sleep_total_min)}${h.sleep_performance_pct != null ? ` (${h.sleep_performance_pct}% performance)` : ''}`)

  const doses = (entry?.peptides ?? []).map(p => `${p.compound} ${p.dose}${p.unit}`)
  if (doses.length) lines.push(`Doses logged: ${doses.join(', ')}`)
  else lines.push('Doses logged: none')

  if (workouts.length) {
    lines.push(`Workouts: ${workouts.map(w => `${w.workout_type ?? 'Workout'}${w.duration_min != null ? ` ${w.duration_min}min` : ''}${w.calories != null ? ` ${w.calories}kcal` : ''}`).join('; ')}`)
  }

  const stats = {
    weight_lbs: entry?.weight_lbs ?? null,
    rhr: entry?.rhr ?? null,
    hrv: entry?.hrv ?? null,
    recovery: h?.recovery_score ?? null,
    strain: h?.strain != null ? round(h.strain) : null,
    sleep_min: h?.sleep_total_min ?? null,
    doses: doses.length,
    workouts: workouts.length
  }

  const hasData = lines.length > 1 || doses.length > 0 || workouts.length > 0
  return { lines, stats, hasData }
}

// --- Weekly ---

async function buildWeekly(db: D1Database, start: string, end: string) {
  const [journal, health, workouts] = await Promise.all([
    journalInRange(db, start, end),
    healthInRange(db, start, end),
    workoutsInRange(db, start, end)
  ])

  const weights = journal.map(e => e.weight_lbs).filter((v): v is number => v != null)
  const lines: string[] = []
  if (weights.length) {
    const first = weights[0]!
    const last = weights[weights.length - 1]!
    lines.push(`Weight: ${last} lbs now (${last - first >= 0 ? '+' : ''}${round(last - first)} over the week), avg ${round(avg(weights)!)}, range ${Math.min(...weights)}–${Math.max(...weights)}`)
  }
  const rhr = avg(journal.map(e => e.rhr!).filter(v => v != null))
  if (rhr != null) lines.push(`Avg resting HR: ${round(rhr)} bpm`)
  const hrv = avg(journal.map(e => e.hrv!).filter(v => v != null))
  if (hrv != null) lines.push(`Avg HRV: ${round(hrv)} ms`)

  const rec = avg(health.map(h => h.recovery_score!).filter(v => v != null))
  if (rec != null) lines.push(`Avg Whoop recovery: ${round(rec)}%`)
  const strain = avg(health.map(h => h.strain!).filter(v => v != null))
  if (strain != null) lines.push(`Avg Whoop strain: ${round(strain)}`)
  const sleep = avg(health.map(h => h.sleep_total_min!).filter(v => v != null))
  if (sleep != null) lines.push(`Avg sleep: ${fmtDuration(sleep)}/night`)

  const doses = tallyDoses(journal)
  if (doses.length) {
    lines.push(`Compounds used: ${doses.map(d => `${d.compound} (${d.days}d, ${d.total}${d.unit} total)`).join('; ')}`)
  }
  else lines.push('Compounds used: none logged')

  if (workouts.length) {
    const totalMin = workouts.reduce((s, w) => s + (w.duration_min ?? 0), 0)
    const totalCal = workouts.reduce((s, w) => s + (w.calories ?? 0), 0)
    lines.push(`Workouts: ${workouts.length} sessions, ${round(totalMin)} min total${totalCal ? `, ${Math.round(totalCal)} kcal` : ''}`)
  }
  else lines.push('Workouts: none')

  const stats = {
    weight_lbs: weights.at(-1) ?? null,
    weight_change: weights.length >= 2 ? round(weights.at(-1)! - weights[0]!) : null,
    avg_recovery: rec != null ? round(rec) : null,
    avg_strain: strain != null ? round(strain) : null,
    avg_sleep_min: sleep != null ? Math.round(sleep) : null,
    compounds: doses.length,
    workouts: workouts.length
  }

  const hasData = journal.length > 0 || health.length > 0 || workouts.length > 0
  return { lines, stats, hasData }
}

function dailyPrompt(date: string, facts: string): string {
  return `You are writing a short daily recap for a personal health dashboard. The reader is the person these metrics belong to — address them as "you". They track their vitals, peptide protocol, sleep, and training closely.

Recap for ${fmtDate(date)}:
${facts}

Write 1-2 short paragraphs highlighting what stands out about the day — notable vitals, recovery/sleep quality, whether they trained, and their protocol adherence. If a "Sustained trends" section is present, weave in the most significant trend: these are precomputed multi-week shifts, and when one is measured against a protocol start date, state that timing relationship plainly (e.g. "your resting HR has averaged X since Y began") — it is an observed association, so don't assert causation, but don't bury it either. Be factual, specific, and warm but concise. If it was an unremarkable day, say so briefly. No greeting, no closing, no medical-advice disclaimers. Plain text only — no markdown, no headers, no bullet characters.`
}

function weeklyPrompt(start: string, end: string, facts: string): string {
  return `You are writing a weekly summary for a personal health dashboard. The reader is the person these metrics belong to — address them as "you". They track their vitals, peptide protocol, sleep, and training closely.

Week of ${fmtDate(start)} – ${fmtDate(end)}:
${facts}

Write 2-3 short paragraphs, in order of importance: overall trends this week (weight, recovery, sleep, HRV/RHR), training volume, and protocol adherence (which compounds, how consistently). If a "Sustained trends" section is present, lead with its most significant findings: these are precomputed multi-week shifts, and when one is measured against a protocol start date, state that timing relationship plainly (e.g. "your resting HR has averaged X since Y began, up from Z in the month before") — it is an observed association, so don't assert causation, but treat it as the headline it is. Call out anything notably better or worse than a typical week. Be factual, specific, and concise. No greeting, no closing, no medical-advice disclaimers. Plain text only — no markdown, no headers, no bullet characters.`
}

async function callClaude(apiKey: string, prompt: string): Promise<string> {
  // The scheduled tasks get exactly one shot per day at this call, so lean on the SDK's
  // backoff-retry (default 2 attempts) a bit harder and cap the request so a hung connection
  // can't run the task into the Workers time limit.
  const anthropic = new Anthropic({ apiKey, maxRetries: 4, timeout: 60_000 })
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  })
  const text = response.content.find(b => b.type === 'text')?.text?.trim()
  if (!text) throw new Error('Digest generation returned no text')
  return text
}

async function storeDigest(
  db: D1Database,
  type: DigestKind,
  periodStart: string,
  periodEnd: string,
  summary: string,
  stats: unknown
) {
  await db.prepare(`
    INSERT INTO digests (type, period_start, period_end, summary, stats, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(type, period_end) DO UPDATE SET
      period_start = excluded.period_start,
      summary = excluded.summary,
      stats = excluded.stats,
      created_at = excluded.created_at
  `).bind(type, periodStart, periodEnd, summary, JSON.stringify(stats ?? {}), new Date().toISOString()).run()
}

export interface DigestResult {
  ok: boolean
  skipped?: boolean
  type: DigestKind
  period_start: string
  period_end: string
  summary?: string
}

// Generate (or regenerate) a digest. `endDate` defaults to yesterday (UTC). For weekly it covers
// the 7 days ending on endDate. Returns { skipped: true } when the period has no data to summarize.
export async function generateDigest(
  db: D1Database,
  apiKey: string,
  kind: DigestKind,
  endDate?: string
): Promise<DigestResult> {
  const end = endDate ?? addDays(new Date().toISOString().slice(0, 10), -1)
  const start = kind === 'weekly' ? addDays(end, -6) : end

  const built = kind === 'weekly' ? await buildWeekly(db, start, end) : await buildDaily(db, end)
  if (!built.hasData) {
    return { ok: true, skipped: true, type: kind, period_start: start, period_end: end }
  }

  // Long-horizon context: protocol change-points and sustained metric shifts over the last
  // ~4 months, so the recap can connect a month of elevated RHR to the TRT start instead of
  // only seeing the period's own numbers.
  const trendWindowStart = addDays(end, -119)
  const [trendJournal, trendHealth] = await Promise.all([
    journalInRange(db, trendWindowStart, end),
    healthInRange(db, trendWindowStart, end)
  ])
  const trends = computeTrends(trendJournal, trendHealth, end)
  const trendLines = formatTrendLines(trends)
  if (trendLines.length) {
    built.lines.push('', 'Sustained trends (multi-week context, precomputed):', ...trendLines)
  }
  if (trends.findings.length) {
    (built.stats as Record<string, unknown>).trends = trends.findings.map(f => ({
      metric: f.key,
      delta: f.delta,
      unit: f.unit,
      since: f.since?.date ?? null
    }))
  }

  const facts = built.lines.join('\n')
  const prompt = kind === 'weekly' ? weeklyPrompt(start, end, facts) : dailyPrompt(end, facts)
  const summary = await callClaude(apiKey, prompt)
  await storeDigest(db, kind, start, end, summary, built.stats)

  return { ok: true, type: kind, period_start: start, period_end: end, summary }
}
