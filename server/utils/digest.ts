import { mergeRules } from '#shared/utils/cycles'
import { PROTOCOL_RULES } from '#shared/utils/protocolRules'
import { eventContext } from '#shared/utils/protocolEvents'
import { localToday } from '#shared/utils/time'
import { shiftDays } from '#shared/utils/dates'
import { dailyDigestFacts, digestTrends, weeklyDigestFacts } from './digestFacts'
import { dailyDigestPrompt, weeklyDigestPrompt } from './digestPrompts'

// Personal-health digest generation: builds the period's fact sheet (digestFacts.ts), wraps it in
// the prompt (digestPrompts.ts), has Claude write a short recap, and upserts it into the digests
// table. Shared by the scheduled tasks (digest:daily, digest:weekly) and the on-demand generate
// endpoint.

export type DigestKind = 'daily' | 'weekly'

async function callClaude(prompt: string): Promise<string> {
  // The scheduled tasks get exactly one shot per day at this call, so lean on the SDK's
  // backoff-retry a bit harder than the shared default and cap the request so a hung connection
  // can't run the task into the Workers time limit.
  const startedAt = Date.now()
  let response
  try {
    // The model runs adaptive thinking by default and max_tokens caps thinking + text
    // together, so leave generous headroom; low effort keeps the thinking spend small
    // for what is a short writing task over precomputed facts.
    response = await createAnthropic({ maxRetries: 4, timeout: 60_000 }).messages.create({
      model: AI_MODELS.digest,
      max_tokens: 8192,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }]
    })
  }
  catch (err) {
    throw aiError(err, 'digest')
  }
  logAiUsage('digest', AI_MODELS.digest, response.usage, response.stop_reason, startedAt)
  // Never store a truncated recap: the text reads finished but stops mid-thought.
  assertCompleted(response.stop_reason, 'digest')
  const text = textOf(response.content)
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
  kind: DigestKind,
  endDate?: string
): Promise<DigestResult> {
  // Home-timezone yesterday: the crons fire mid-morning Central where UTC agrees, but an
  // on-demand regenerate after 7pm used to pick a period ending on the wrong day.
  const end = endDate ?? shiftDays(localToday(), -1)
  const start = kind === 'weekly' ? shiftDays(end, -6) : end

  // The effective dosing schedule — standing rules with any planned cycle merged in — and the
  // home-timezone "today", so the schedule check knows whether the period is still under way
  // (a same-day regenerate from the dashboard) or closed (the crons run for yesterday).
  const cycles = await loadCycles(db)
  const rules = mergeRules(PROTOCOL_RULES, cycles)
  const today = localToday()

  const built = kind === 'weekly'
    ? await weeklyDigestFacts(db, start, end, rules, today)
    : await dailyDigestFacts(db, end, rules, today)
  if (!built.hasData) {
    return { ok: true, skipped: true, type: kind, period_start: start, period_end: end }
  }

  const trends = await digestTrends(db, end)
  if (trends.lines.length) {
    built.lines.push('', 'Sustained trends (multi-week context, precomputed):', ...trends.lines)
  }
  if (trends.findings.length) {
    built.stats.trends = trends.findings.map(f => ({
      metric: f.key,
      delta: f.delta,
      unit: f.unit,
      since: f.since?.date ?? null
    }))
  }

  // Standing supplement stack + planned cycles + recent shots + dated notes — context the dose
  // log doesn't carry (vitamins/meds are taken daily but not logged; a cycle's timing frames
  // every trend on it; a vaccine or a travel weekend explains a bad-looking few days).
  const [supplements, cyclesCtx, vaccines] = await Promise.all([
    supplementContext(db, end),
    cycleContext(db, end, cycles),
    vaccineContext(db, end)
  ])
  const regimen = [supplements, cyclesCtx, vaccines, eventContext(end)].filter(Boolean).join('\n\n')

  const facts = built.lines.join('\n')
  const prompt = kind === 'weekly' ? weeklyDigestPrompt(start, end, facts, regimen) : dailyDigestPrompt(end, facts, regimen)
  const summary = await callClaude(prompt)
  await storeDigest(db, kind, start, end, summary, built.stats)

  return { ok: true, type: kind, period_start: start, period_end: end, summary }
}
