import { zSummaryGenerate } from '#shared/utils/schemas'
import { diffDays, shiftDays } from '#shared/utils/dates'
import { eventContext } from '#shared/utils/protocolEvents'
import { protocolSchedule } from '#shared/utils/protocolProse'

// The DEXA counterpart of /api/labs/generate-summary: narrates the newest scan against the ones
// before it and stores the prose on the row with its provenance. The upload page calls it right
// after a scan saves; the DEXA page's regen button calls it again.

// Scans fed to the prompt as comparison context, the new one included — bounds the prompt size.
const MAX_SCANS = 6
// Daily readings (scale weight from the journal, Withings body fat from Apple Health) averaged
// over this many days up to each scan, so the DEXA can be squared with what the bathroom scale
// was saying that week rather than a single morning's reading.
const DAILY_WINDOW_DAYS = 7
// Training window before a first scan, when there is no previous scan to count from.
const BASELINE_TRAINING_DAYS = 90

interface ScanRow {
  date: string
  weight_lbs: number
  total: string
  regions: string
  vat: string | null
  ag_ratio: number | null
  bone_density: string | null
  symmetry: string | null
}

interface Region {
  fat_pct?: number
  fat_lbs?: number
  lean_lbs?: number
}

const num = (v: unknown, decimals = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(decimals) : '—')

function describeScan(row: ScanRow, isNew: boolean): string[] {
  const total = JSON.parse(row.total || '{}') as Record<string, number>
  const regions = JSON.parse(row.regions || '{}') as Record<string, Region | undefined>
  const vat = row.vat ? JSON.parse(row.vat) as Record<string, number> : null
  const bone = row.bone_density ? JSON.parse(row.bone_density) as Record<string, number> : null
  const symmetry = row.symmetry ? JSON.parse(row.symmetry) as Record<string, number> : null

  const region = (key: string) => {
    const r = regions[key]
    if (!r) return null
    const lean = r.lean_lbs != null ? ` / ${num(r.lean_lbs)} lean` : ''
    return `${key} ${num(r.fat_pct)}% / ${num(r.fat_lbs)} fat${lean}`
  }

  const lines = [
    `${isNew ? 'NEW ' : ''}${row.date}: scale weight ${num(row.weight_lbs)} · DEXA total ${num(total.total_mass_lbs)} · fat ${num(total.fat_mass_lbs)} (${num(total.body_fat_pct)}%) · lean ${num(total.lean_mass_lbs)} · BMC ${num(total.bmc_lbs)} · fat-free ${num(total.fat_free_lbs)}`,
    `  regions (fat% / fat lbs / lean lbs): ${['arms', 'legs', 'trunk', 'android', 'gynoid'].map(region).filter(Boolean).join('; ')}`
  ]
  const extras = [
    vat ? `VAT ${num(vat.volume_in3, 2)} in³ (${num(vat.fat_mass_lbs, 2)} lbs)` : null,
    row.ag_ratio != null ? `A/G ${num(row.ag_ratio, 2)}` : null,
    bone ? `total-body BMD ${num(bone.total_bmd, 3)} g/cm² (T ${num(bone.t_score)}, Z ${num(bone.z_score)})` : null
  ].filter(Boolean)
  if (extras.length) lines.push(`  ${extras.join(' · ')}`)
  if (symmetry) {
    lines.push(`  lean symmetry (lbs): arms R ${num(symmetry.right_arm_lean)} / L ${num(symmetry.left_arm_lean)}; legs R ${num(symmetry.right_leg_lean)} / L ${num(symmetry.left_leg_lean)}`)
  }
  return lines
}

/** What the scale and the Withings readings averaged in the week up to a scan — null when neither has data. */
async function dailyContext(db: D1Database, date: string): Promise<string | null> {
  const from = shiftDays(date, -(DAILY_WINDOW_DAYS - 1))
  const [scale, withings] = await Promise.all([
    db.prepare('SELECT AVG(weight_lbs) AS avg, COUNT(weight_lbs) AS n FROM journal_entries WHERE date >= ?1 AND date <= ?2')
      .bind(from, date).first<{ avg: number | null, n: number }>(),
    db.prepare('SELECT AVG(body_fat_pct) AS bf, COUNT(body_fat_pct) AS n, AVG(lean_body_mass_lbs) AS lean FROM health_metrics WHERE date >= ?1 AND date <= ?2')
      .bind(from, date).first<{ bf: number | null, n: number, lean: number | null }>()
  ])
  const parts = [
    scale?.n ? `scale weight avg ${num(scale.avg)} lbs over ${scale.n} logged days` : null,
    withings?.n ? `Withings body fat avg ${num(withings.bf)}%${withings.lean != null ? `, lean ${num(withings.lean)} lbs` : ''} over ${withings.n} readings` : null
  ].filter(Boolean)
  return parts.length ? `  daily readings in the ${DAILY_WINDOW_DAYS} days up to this scan: ${parts.join('; ')}` : null
}

/** Logged training between two dates (exclusive of the first), by workout type. */
async function trainingContext(db: D1Database, from: string, to: string): Promise<string> {
  const { results } = await db.prepare(
    'SELECT workout_type, COUNT(*) AS sessions, SUM(duration_min) AS minutes FROM workouts WHERE date > ?1 AND date <= ?2 GROUP BY workout_type ORDER BY sessions DESC'
  ).bind(from, to).all<{ workout_type: string, sessions: number, minutes: number | null }>()
  const rows = results ?? []
  const span = `between ${from} and ${to} (${diffDays(from, to)} days)`
  if (!rows.length) return `Training logged ${span}: none.`
  const total = rows.reduce((sum, r) => sum + r.sessions, 0)
  const byType = rows.map(r => `${r.workout_type} ×${r.sessions}${r.minutes ? ` (${Math.round(r.minutes)} min)` : ''}`).join(', ')
  return `Training logged ${span}: ${total} sessions — ${byType}.`
}

export default defineEventHandler(async (event) => {
  requireOwner(event)
  await requireUploadPin(event)

  const { date } = await readValidatedJson(event, zSummaryGenerate)

  const db = getDb(event)
  const { results } = await db.prepare(
    `SELECT date, weight_lbs, total, regions, vat, ag_ratio, bone_density, symmetry FROM dexa_entries WHERE date <= ?1 ORDER BY date DESC LIMIT ${MAX_SCANS}`
  ).bind(date).all<ScanRow>()

  const scans = (results ?? []).reverse()
  const target = scans.at(-1)
  if (!target || target.date !== date) {
    throw createError({ statusCode: 404, message: `No DEXA scan found for ${date}` })
  }
  const previous = scans.at(-2) ?? null

  const scanBlock: string[] = []
  for (const row of scans) {
    scanBlock.push(...describeScan(row, row.date === date))
    const daily = await dailyContext(db, row.date)
    if (daily) scanBlock.push(daily)
  }
  const trainingBlock = await trainingContext(db, previous?.date ?? shiftDays(date, -BASELINE_TRAINING_DAYS), date)

  // Dosing curves explain blood levels, not tissue, so the timing lines stay out of this one.
  const protocolLines = await protocolContext(db, date, { noun: 'scan', timing: false })
  const protocolBlock = protocolLines.length ? `\n${protocolLines.join('\n')}\n` : ''
  const supplementBlock = await supplementContext(db, date)
  const cycleBlock = await cycleContext(db, date)
  const eventBlock = eventContext(date)

  const prompt = `You are writing a body-composition summary for a personal health dashboard. The reader is the person who was scanned — address them as "you". They lift seriously, track their body closely and understand DEXA output. They run a self-directed hormone protocol whose core is testosterone (TRT), HGH and hCG, with ancillary peptides rotating around that core (the schedule below is what was running as of this scan), and they are in a lean-mass phase: adding muscle — arms and chest especially — while holding body fat in the fit range. Treat regional lean changes and left/right symmetry as training signals worth a sentence each.

${protocolSchedule(date)}
${protocolBlock}${supplementBlock ? `\n${supplementBlock}\n` : ''}${cycleBlock ? `\n${cycleBlock}\n` : ''}${eventBlock ? `\n${eventBlock}\n` : ''}
DEXA scans on file (oldest -> newest; "NEW" marks the new scan; masses in lbs). "Scale weight" is the clinic-typed figure from the report header and can lag — the DEXA total is the measured one:
${scanBlock.join('\n')}

${trainingBlock}

Reference points from the scan provider: VAT volume under 52 in³ is ideal, 52–112 elevated, above that high; an A/G ratio under 1.0 is optimal; a total-body BMD T-score above -1.0 is normal and -1.0 to -2.5 is osteopenia; typical left/right lean imbalance is up to 0.5 lbs for arms and 1.5 lbs for legs. Total-body BMD is not the hip/spine DEXA used for osteoporosis screening — say so if you comment on bone.

Write 3-4 short paragraphs, in order of importance:
1. The headline change versus the previous scan, with specific numbers and % change: fat mass against lean mass, body fat %, and where the lean went by region (arms, legs, trunk). If this is the first scan, describe where the baseline sits instead.
2. Fat distribution and visceral fat — android vs gynoid, A/G ratio, VAT — and what those levels mean for metabolic risk.
3. Symmetry and bone: the left/right lean differences against the typical ranges above and what to do about them in training; bone density context in a sentence or two.
4. Attribution and next steps: how much of any lean change is plausibly tissue rather than water and glycogen (creatine, carbohydrate, HGH-related fluid), how the DEXA squares with the scale and Withings readings around each scan, what in the protocol and training context above most likely drove the change, and what to watch or change before the next scan — including when to rescan.

Be factual, specific and concise, and keep the whole thing to roughly 350 words — the dashboard shows it above the scan, so it has to be read in a minute, not studied. If little changed, say so briefly — do not manufacture concerns. No greeting, no closing, no medical-advice disclaimers or "consult your doctor" boilerplate. Plain text only — no markdown, no headers, no bullet characters.`

  const startedAt = Date.now()
  let response
  try {
    response = await createAnthropic().messages.create({
      model: AI_MODELS.summary,
      // Same budget as the labs summary: 3-4 paragraphs of prose plus adaptive thinking.
      max_tokens: 16_000,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: prompt }]
    })
  }
  catch (err) {
    throw aiError(err, 'summary')
  }
  logAiUsage('summary', AI_MODELS.summary, response.usage, response.stop_reason, startedAt)
  assertCompleted(response.stop_reason, 'summary')

  const summary = textOf(response.content)
  if (!summary) {
    throw createError({ statusCode: 502, message: 'Summary generation returned no text' })
  }

  const provenance = { model: AI_MODELS.summary, promptHash: promptHash(prompt), at: new Date().toISOString() }
  await db.prepare(`
    UPDATE dexa_entries
    SET ai_summary = ?2, ai_summary_model = ?3, ai_summary_prompt_hash = ?4, ai_summary_at = ?5
    WHERE date = ?1
  `).bind(date, summary, provenance.model, provenance.promptHash, provenance.at).run()

  return { ok: true, date, summary, ...provenance }
})
