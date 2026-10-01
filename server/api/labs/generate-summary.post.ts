import { zSummaryGenerate } from '#shared/utils/schemas'
import { BIOMARKERS } from '../../../app/data/biomarkers'
import { eventContext } from '#shared/utils/protocolEvents'
import { protocolSchedule } from '#shared/utils/protocolProse'

interface LabsRow {
  date: string
  fasting: number
  markers: string
  qualitative: string
}

// How many prior draws to include as comparison context — bounds the prompt size.
const MAX_PRIOR_DRAWS = 6

// Protocol context (dose-days per compound, draw timing on the dosing curves, stops and dose
// changes) is server/utils/protocolContext.ts, shared with the DEXA summary.

function refRange(key: string): string {
  const meta = BIOMARKERS[key]
  if (!meta) return ''
  if (meta.refMin != null && meta.refMax != null) return `ref ${meta.refMin}-${meta.refMax}`
  if (meta.refMin != null) return `ref >=${meta.refMin}`
  if (meta.refMax != null) return `ref <=${meta.refMax}`
  return ''
}

export default defineEventHandler(async (event) => {
  requireOwner(event)
  await requireUploadPin(event)

  const { date } = await readValidatedJson(event, zSummaryGenerate)

  const db = getDb(event)
  // Fetch only the target draw + comparison window — LIMIT in SQL rather than materializing and
  // JSON-parsing every historical draw only to slice it in JS.
  const { results } = await db.prepare(
    `SELECT date, fasting, markers, qualitative FROM labs_entries WHERE date <= ?1 ORDER BY date DESC LIMIT ${MAX_PRIOR_DRAWS + 1}`
  ).bind(date).all<LabsRow>()

  const rows = (results ?? []).reverse()
  const targetRow = rows.at(-1)
  if (!targetRow || targetRow.date !== date) {
    throw createError({ statusCode: 404, message: `No labs entry found for ${date}` })
  }

  const draws = rows.map(r => ({
    date: r.date,
    fasting: !!r.fasting,
    markers: JSON.parse(r.markers || '{}') as Record<string, number | null>
  }))

  const target = draws.at(-1)!
  const keys = Object.keys(target.markers).filter(k => target.markers[k] != null)
  if (!keys.length) {
    throw createError({ statusCode: 400, message: 'Entry has no numeric markers to summarize' })
  }

  const markerLines = keys.map((key) => {
    const meta = BIOMARKERS[key]
    const bracket = [meta?.unit, refRange(key)].filter(Boolean).join(', ')
    const head = `${meta?.label ?? key}${bracket ? ` [${bracket}]` : ''}`
    const history = draws
      .filter(d => d.markers[key] != null)
      .map(d => `${d.date === date ? 'NEW ' : ''}${d.date}: ${d.markers[key]}`)
      .join(' -> ')
    return `${head}: ${history}`
  })

  const qualitative = JSON.parse(targetRow.qualitative || '[]') as { name: string, result: string }[]
  const qualitativeBlock = qualitative.length
    ? `\nQualitative results on file for this date:\n${qualitative.map(q => `${q.name}: ${q.result}`).join('\n')}\n`
    : ''

  const protocolLines = await protocolContext(db, date)
  const protocolBlock = protocolLines.length ? `\n${protocolLines.join('\n')}\n` : ''
  const supplementBlock = await supplementContext(db, date)
  // Planned-cycle context as of the draw date: an active cycle turns this draw into a
  // checkpoint (compare gating markers against the pre-cycle baseline), an upcoming one makes
  // it the baseline itself.
  const cycleBlock = await cycleContext(db, date)
  // Shots and dated one-off notes as of the draw date — the difference between "IGF-1 dipped"
  // and "IGF-1 dipped two days after a travel weekend without HGH".
  const vaccineBlock = await vaccineContext(db, date)
  const eventBlock = eventContext(date)

  const prompt = `You are writing a trend summary for a personal bloodwork dashboard. The reader is the person whose labs these are — address them as "you". They track their own biomarkers closely and understand them well. They run a self-directed hormone protocol whose core is testosterone (TRT), HGH, and hCG, with ancillary peptides rotating around that core (the schedule below says what was running as of this draw) — and they are weighing adding a mild anabolic (Primobolan or Anavar) for lean-mass goals — so markers that gate that decision (lipids, especially HDL; liver enzymes; hematocrit/hemoglobin; iron/ferritin; blood pressure proxies) deserve extra attention when present. They are not currently taking an aromatase inhibitor but keep Anastrozole on hand from their TRT clinic for symptomatic use; estradiol has been climbing and may read over 100 pg/mL on new draws. Treat elevated estradiol as a known, watched issue: quantify the trend against prior draws, name the specific symptoms and risks worth monitoring at that level, and frame the on-hand Anastrozole as the discussion point for symptom-driven use — not something to start reflexively.

${protocolSchedule(date)}
${supplementBlock ? `\n${supplementBlock}\n` : ''}${cycleBlock ? `\n${cycleBlock}\n` : ''}${vaccineBlock ? `\n${vaccineBlock}\n` : ''}${eventBlock ? `\n${eventBlock}\n` : ''}
The oral stack above matters here: supplements move blood markers (iron dosing moves ferritin/iron; soluble fiber, omega-3s, and CoQ10 bear on lipids; finasteride and dutasteride lower DHT and roughly halve PSA once 6–12 months in, so double an on-treatment PSA before comparing it with pre-treatment draws; turmeric inhibits iron absorption; ashwagandha touches thyroid and cortisol; berberine/TUDCA-style liver support moves liver enzymes and lipids), and recent starts, stops, and dose changes are dated above — check the stack before attributing a marker shift to the injectable protocol alone.

New draw: ${date} (${target.fasting ? 'fasting' : 'non-fasting'})
Draws included for comparison: ${draws.map(d => `${d.date}${d.fasting ? ' (fasting)' : ' (non-fasting)'}`).join(', ')}
${protocolBlock}
Marker history (oldest -> newest, "NEW" marks the new draw):
${markerLines.join('\n')}
${qualitativeBlock}
Write 3-5 short paragraphs, in order of importance:
1. The most significant changes versus the previous draw, with specific numbers and % change.
2. Any values in the new draw outside their reference range.
3. Notable trends across multiple draws (steady climbs or declines). Where the timing lines up with a protocol change above, say so plainly and explain the likely physiological mechanism in a sentence (e.g. testosterone stimulates erythropoiesis, so red cell production rises and draws down ferritin/iron stores) — frame it as the likely driver, not a certainty.
4. For each marker that is out of range or trending in a concerning direction, give 2-3 concrete steps to improve it (specific dietary changes, supplementation with typical doses and timing, spacing interfering substances, blood donation where relevant, and when to retest to confirm the trend). Skip this for markers that are stable and in range.

When a hormone-sensitive marker (total/free testosterone, estradiol, hematocrit) moved versus prior draws, weigh the draw-timing lines above before calling it a real change — near-peak vs near-trough sampling can explain an apparent shift on an unchanged protocol, and you should say so when it does.

Be factual, specific, and concise. If everything is stable and in range, say so briefly — do not manufacture concerns. No greeting, no closing, no medical-advice disclaimers or "consult your doctor" boilerplate. Plain text only — no markdown, no headers, no bullet characters.`

  const startedAt = Date.now()
  let response
  try {
    response = await createAnthropic().messages.create({
      model: AI_MODELS.summary,
      // 3-5 paragraphs of prose. The old 2048 cap could truncate a summary of a wide panel
      // mid-sentence, and the truncated text was stored as though it were finished. Adaptive
      // thinking shares the max_tokens budget with the prose, hence the headroom.
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
    UPDATE labs_entries
    SET ai_summary = ?2, ai_summary_model = ?3, ai_summary_prompt_hash = ?4, ai_summary_at = ?5
    WHERE date = ?1
  `).bind(date, summary, provenance.model, provenance.promptHash, provenance.at).run()

  return { ok: true, date, summary, ...provenance }
})
