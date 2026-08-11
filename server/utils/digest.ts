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

interface SodaEntry { time?: string, drink?: string, size?: string }

interface JournalRow {
  date: string
  weight_lbs: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  rhr: number | null
  hrv: number | null
  peptides: Peptide[]
  sodas: SodaEntry[]
  notes: string | null
}

interface HealthRow {
  date: string
  recovery_score: number | null
  strain: number | null
  sleep_total_min: number | null
  sleep_performance_pct: number | null
  sleep_deep_min: number | null
  sleep_rem_min: number | null
  body_fat_pct: number | null
  lean_body_mass_lbs: number | null
}

interface WorkoutRow {
  date: string
  workout_type: string | null
  duration_min: number | null
  calories: number | null
  avg_hr: number | null
}

const JOURNAL_COLS = 'date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides, sodas, notes'

function parseJournalRow(r: Record<string, unknown>): JournalRow {
  return {
    date: r.date as string,
    weight_lbs: (r.weight_lbs as number | null) ?? null,
    bp_systolic: (r.bp_systolic as number | null) ?? null,
    bp_diastolic: (r.bp_diastolic as number | null) ?? null,
    rhr: (r.rhr as number | null) ?? null,
    hrv: (r.hrv as number | null) ?? null,
    peptides: JSON.parse((r.peptides as string) || '[]'),
    sodas: JSON.parse((r.sodas as string) || '[]'),
    notes: (r.notes as string | null) ?? null
  }
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

// Most recent journal entry with a non-null weight/rhr/hrv strictly before `date`, for deltas.
async function priorJournal(db: D1Database, date: string): Promise<JournalRow | null> {
  const { results } = await db.prepare(
    `SELECT ${JOURNAL_COLS} FROM journal_entries WHERE date < ?1 ORDER BY date DESC LIMIT 1`
  ).bind(date).all()
  const r = results?.[0]
  return r ? parseJournalRow(r) : null
}

// Dates of lab draws inside the period, so the digest can point at fresh results.
async function labDatesInRange(db: D1Database, start: string, end: string): Promise<string[]> {
  const { results } = await db.prepare(
    'SELECT date FROM labs_entries WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC'
  ).bind(start, end).all()
  return (results ?? []).map(r => r.date as string)
}

// "5 (coke zero x3, dr pepper x2)" — freeform drink names are normalized (trim/lowercase)
// before counting so near-duplicate spellings don't split the tally.
function sodaSummary(entries: JournalRow[]): { count: number, breakdown: string } {
  const byDrink = new Map<string, { label: string, n: number }>()
  let count = 0
  for (const e of entries) {
    for (const s of e.sodas ?? []) {
      count++
      const label = (s.drink ?? 'unspecified').trim() || 'unspecified'
      const key = label.toLowerCase()
      const cur = byDrink.get(key) ?? { label, n: 0 }
      cur.n++
      byDrink.set(key, cur)
    }
  }
  const breakdown = [...byDrink.values()].sort((a, b) => b.n - a.n).map(d => d.n > 1 ? `${d.label} x${d.n}` : d.label).join(', ')
  return { count, breakdown }
}

// Dated journal notes as one fact-sheet line; notes are freeform so newlines are flattened
// and each is capped to keep the prompt bounded.
function noteLines(entries: JournalRow[]): string[] {
  return entries
    .filter(e => e.notes?.trim())
    .map((e) => {
      const flat = e.notes!.trim().replace(/\s*\n+\s*/g, ' / ')
      return `${fmtDate(e.date)}: "${flat.length > 280 ? flat.slice(0, 277) + '...' : flat}"`
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
    .map(([compound, v]) => ({ compound, days: v.days.size, total: round(v.total, 2), unit: v.unit }))
    .sort((a, b) => b.days - a.days)
}

// --- Daily ---

async function buildDaily(db: D1Database, date: string) {
  const [journal, health, workouts, prev, baseJournal, baseHealth, labDates] = await Promise.all([
    journalInRange(db, date, date),
    healthInRange(db, date, date),
    workoutsInRange(db, date, date),
    priorJournal(db, date),
    journalInRange(db, addDays(date, -7), addDays(date, -1)),
    healthInRange(db, addDays(date, -7), addDays(date, -1)),
    labDatesInRange(db, date, date)
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
  if (sodas.count) lines.push(`Sodas: ${sodas.count} (${sodas.breakdown})`)

  const notes = noteLines(journal)
  if (notes.length) lines.push(`Your note for the day — ${notes.join('; ')}`)

  if (labDates.length) lines.push('Labs were drawn this day — results are on the labs page.')

  const stats = {
    weight_lbs: entry?.weight_lbs ?? null,
    rhr: entry?.rhr ?? null,
    hrv: entry?.hrv ?? null,
    recovery: h?.recovery_score ?? null,
    strain: h?.strain != null ? round(h.strain) : null,
    sleep_min: h?.sleep_total_min ?? null,
    doses: doses.length,
    workouts: workouts.length,
    sodas: sodas.count
  }

  // Baseline is context, not data — decide whether the day is worth summarizing first.
  const hasData = lines.length > 1 || doses.length > 0 || workouts.length > 0

  const base: string[] = []
  const bWeight = avg(baseJournal.map(e => e.weight_lbs!))
  if (bWeight != null) base.push(`avg weight ${round(bWeight)} lbs`)
  const bRhr = avg(baseJournal.map(e => e.rhr!))
  if (bRhr != null) base.push(`avg resting HR ${round(bRhr)} bpm`)
  const bHrv = avg(baseJournal.map(e => e.hrv!))
  if (bHrv != null) base.push(`avg HRV ${round(bHrv)} ms`)
  const bRec = avg(baseHealth.map(x => x.recovery_score!))
  if (bRec != null) base.push(`avg recovery ${round(bRec)}%`)
  const bSleep = avg(baseHealth.map(x => x.sleep_total_min!))
  if (bSleep != null) base.push(`avg sleep ${fmtDuration(bSleep)}`)
  if (base.length) lines.push(`Prior 7 days, for comparison: ${base.join(', ')}`)

  return { lines, stats, hasData }
}

// --- Weekly ---

async function buildWeekly(db: D1Database, start: string, end: string) {
  const prevStart = addDays(start, -7)
  const prevEnd = addDays(start, -1)
  const [journal, health, workouts, prevJournal, prevHealth, prevWorkouts, labDates] = await Promise.all([
    journalInRange(db, start, end),
    healthInRange(db, start, end),
    workoutsInRange(db, start, end),
    journalInRange(db, prevStart, prevEnd),
    healthInRange(db, prevStart, prevEnd),
    workoutsInRange(db, prevStart, prevEnd),
    labDatesInRange(db, start, end)
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

  const sysVals = journal.map(e => e.bp_systolic).filter((v): v is number => v != null)
  const diaVals = journal.map(e => e.bp_diastolic).filter((v): v is number => v != null)
  const bpSys = avg(sysVals)
  const bpDia = avg(diaVals)
  if (bpSys != null && bpDia != null) {
    lines.push(`Avg blood pressure: ${Math.round(bpSys)}/${Math.round(bpDia)} (systolic range ${Math.min(...sysVals)}–${Math.max(...sysVals)}, ${sysVals.length} readings)`)
  }

  const rec = avg(health.map(h => h.recovery_score!).filter(v => v != null))
  if (rec != null) lines.push(`Avg Whoop recovery: ${round(rec)}%`)
  const strain = avg(health.map(h => h.strain!).filter(v => v != null))
  if (strain != null) lines.push(`Avg Whoop strain: ${round(strain)}`)
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
      fat != null ? `avg body fat ${round(fat)}%` : null,
      lean != null ? `avg lean mass ${round(lean)} lbs` : null
    ].filter(Boolean)
    lines.push(`Body composition (scale): ${parts.join(', ')}`)
  }

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

  const sodas = sodaSummary(journal)
  lines.push(sodas.count ? `Sodas: ${sodas.count} (${sodas.breakdown})` : 'Sodas: none logged')

  const notes = noteLines(journal)
  if (notes.length) lines.push(`Your notes this week — ${notes.join('; ')}`)

  if (labDates.length) lines.push(`Labs drawn ${labDates.map(fmtDate).join(', ')} — results are on the labs page.`)

  // Previous-week baseline so "better/worse than a typical week" is grounded in numbers.
  const base: string[] = []
  const pRec = avg(prevHealth.map(h => h.recovery_score!))
  if (pRec != null) base.push(`avg recovery ${round(pRec)}%`)
  const pSleep = avg(prevHealth.map(h => h.sleep_total_min!))
  if (pSleep != null) base.push(`avg sleep ${fmtDuration(pSleep)}/night`)
  const pRhr = avg(prevJournal.map(e => e.rhr!))
  if (pRhr != null) base.push(`avg resting HR ${round(pRhr)} bpm`)
  const pHrv = avg(prevJournal.map(e => e.hrv!))
  if (pHrv != null) base.push(`avg HRV ${round(pHrv)} ms`)
  const pSys = avg(prevJournal.map(e => e.bp_systolic!))
  const pDia = avg(prevJournal.map(e => e.bp_diastolic!))
  if (pSys != null && pDia != null) base.push(`avg BP ${Math.round(pSys)}/${Math.round(pDia)}`)
  const pWeights = prevJournal.map(e => e.weight_lbs).filter((v): v is number => v != null)
  if (pWeights.length) base.push(`avg weight ${round(avg(pWeights)!)} lbs`)
  base.push(`${prevWorkouts.length} workout${prevWorkouts.length === 1 ? '' : 's'}`)
  const pSodas = sodaSummary(prevJournal)
  base.push(`${pSodas.count} soda${pSodas.count === 1 ? '' : 's'}`)
  if (prevJournal.length || prevHealth.length || prevWorkouts.length) {
    lines.push(`Previous week (${fmtDate(prevStart)} – ${fmtDate(prevEnd)}), for comparison: ${base.join(', ')}`)
  }

  const stats = {
    weight_lbs: weights.at(-1) ?? null,
    weight_change: weights.length >= 2 ? round(weights.at(-1)! - weights[0]!) : null,
    avg_recovery: rec != null ? round(rec) : null,
    avg_strain: strain != null ? round(strain) : null,
    avg_sleep_min: sleep != null ? Math.round(sleep) : null,
    avg_bp_systolic: bpSys != null ? Math.round(bpSys) : null,
    avg_bp_diastolic: bpDia != null ? Math.round(bpDia) : null,
    compounds: doses.length,
    workouts: workouts.length,
    sodas: sodas.count
  }

  const hasData = journal.length > 0 || health.length > 0 || workouts.length > 0
  return { lines, stats, hasData }
}

// Standing context injected into every digest prompt — this is what steers the model's
// priorities and tone. Edit to taste as goals change.
const READER_CONTEXT = `About the reader: an adult man running a self-directed TRT + peptide protocol alongside regular training. His priorities: body recomposition (adding lean mass without adding fat), sleep and recovery quality, and keeping cardiovascular markers — blood pressure and resting HR — in a healthy range while on protocol. He tracks soda intake because he is trying to keep it low. He wants honest signal over encouragement: if something looks off or is trending the wrong way, say so directly.`

const STYLE_RULES = `Ground rules:
- The dashboard already shows the raw stats below your summary, so don't inventory every metric — cite a number only when you're interpreting it (a delta, a comparison against a baseline, something out of range).
- Lines marked "for comparison" are baselines — use them to judge better/worse instead of guessing.
- If a "Your note(s)" line is present, those are the reader's own words — use them to explain anomalies (a rough night, travel, drinks) rather than speculating.
- If blood pressure is running high (around 130+ systolic or 85+ diastolic), flag it plainly.
- Formatting: light Markdown — **bold** the handful of numbers or findings that matter most, *italics* sparingly, and a short bullet list only where it reads better than prose. No headings, no tables, no code blocks.
- No greeting, no closing, no medical-advice disclaimers.
- End with one forward-looking sentence: the single most useful thing to watch or try next.`

function dailyPrompt(date: string, facts: string): string {
  return `You are writing a short daily recap for a personal health dashboard. The reader is the person these metrics belong to — address them as "you". ${READER_CONTEXT}

Recap for ${fmtDate(date)}:
${facts}

Write 1-2 short paragraphs highlighting what stands out about the day — notable vitals against the prior-7-day baseline, recovery/sleep quality, whether they trained, and their protocol adherence. If a "Sustained trends" section is present, weave in the most significant trend: these are precomputed multi-week shifts, and when one is measured against a protocol start date, state that timing relationship plainly (e.g. "your resting HR has averaged X since Y began") — it is an observed association, so don't assert causation, but don't bury it either. Be factual, specific, and warm but concise. If it was an unremarkable day, say so briefly.

${STYLE_RULES}`
}

function weeklyPrompt(start: string, end: string, facts: string): string {
  return `You are writing a weekly summary for a personal health dashboard. The reader is the person these metrics belong to — address them as "you". ${READER_CONTEXT}

Week of ${fmtDate(start)} – ${fmtDate(end)}:
${facts}

Write 2-3 short paragraphs, in order of importance: overall trends this week against the previous week (weight, recovery, sleep, HRV/RHR, blood pressure), training volume, and protocol adherence (which compounds, how consistently). If a "Sustained trends" section is present, lead with its most significant findings: these are precomputed multi-week shifts, and when one is measured against a protocol start date, state that timing relationship plainly (e.g. "your resting HR has averaged X since Y began, up from Z in the month before") — it is an observed association, so don't assert causation, but treat it as the headline it is. Call out anything notably better or worse than the previous week. Be factual, specific, and concise.

${STYLE_RULES}`
}

async function callClaude(apiKey: string, prompt: string): Promise<string> {
  // The scheduled tasks get exactly one shot per day at this call, so lean on the SDK's
  // backoff-retry (default 2 attempts) a bit harder and cap the request so a hung connection
  // can't run the task into the Workers time limit.
  const anthropic = new Anthropic({ apiKey, maxRetries: 4, timeout: 60_000 })
  // Sonnet 5 runs adaptive thinking by default and max_tokens caps thinking + text
  // together, so leave generous headroom; low effort keeps the thinking spend small
  // for what is a short writing task over precomputed facts.
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: prompt }]
  })
  if (response.stop_reason !== 'end_turn') {
    throw new Error(`Digest generation stopped early (${response.stop_reason}) — not storing a truncated summary`)
  }
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
