import Anthropic from '@anthropic-ai/sdk'
import { BIOMARKERS } from '../../../app/data/biomarkers'

interface LabsRow {
  date: string
  fasting: number
  markers: string
  qualitative: string
}

// How many prior draws to include as comparison context — bounds the prompt size.
const MAX_PRIOR_DRAWS = 6

// Dose history window fed to protocol-change detection (matches the digests' trend window),
// and how recent a dose must be for a compound to count as part of the current protocol.
const PROTOCOL_LOOKBACK_DAYS = 120
const CURRENT_PROTOCOL_DAYS = 21

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Protocol context lines for the prompt: what's currently being dosed, and start/stop/adjust
// events near the draw — so the model can attribute marker shifts (e.g. testosterone ->
// more erythropoiesis -> ferritin drawdown) instead of reading trends in a vacuum.
async function protocolContext(db: D1Database, date: string): Promise<string[]> {
  const { results } = await db.prepare(
    'SELECT date, peptides FROM journal_entries WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC'
  ).bind(addDays(date, -PROTOCOL_LOOKBACK_DAYS), date).all()
  const journal: TrendJournalRow[] = (results ?? []).map(r => ({
    date: r.date as string,
    weight_lbs: null,
    rhr: null,
    hrv: null,
    bp_systolic: null,
    peptides: JSON.parse((r.peptides as string) || '[]')
  }))
  if (!journal.length) return []

  const current = new Map<string, number>()
  for (const row of journal) {
    if (row.date < addDays(date, -CURRENT_PROTOCOL_DAYS)) continue
    for (const p of row.peptides ?? []) {
      if (p.compound) current.set(p.compound, (current.get(p.compound) ?? 0) + 1)
    }
  }

  const lines: string[] = []
  if (current.size) {
    lines.push(`Current protocol (compounds dosed in the ${CURRENT_PROTOCOL_DAYS} days up to this draw): ${
      [...current.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (${n} dose-days)`).join(', ')}`)
  }
  else {
    lines.push('Current protocol: no compounds logged in the 3 weeks up to this draw.')
  }

  const changes = detectProtocolChanges(journal, date)
  if (changes.length) {
    lines.push(`Protocol changes in the ~90 days before this draw: ${changes
      .map(c => c.kind === 'stop'
        ? `${c.compounds.join(' + ')} stopped around ${c.date}`
        : c.kind === 'adjust'
          ? `${c.compounds.join(' + ')} dosing changed ${c.date}`
          : `${c.compounds.join(' + ')} began ${c.date}`)
      .join('; ')}`)
  }
  return lines
}

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
  requireUploadPin(event)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'ANTHROPIC_API_KEY is not configured' })
  }

  const body = await readBody<{ date?: string }>(event)
  const date = body?.date
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createError({ statusCode: 400, message: 'Missing or invalid date field' })
  }

  const db = getDb(event)
  const { results } = await db.prepare(
    'SELECT date, fasting, markers, qualitative FROM labs_entries WHERE date <= ?1 ORDER BY date ASC'
  ).bind(date).all<LabsRow>()

  const rows = results ?? []
  const targetRow = rows.at(-1)
  if (!targetRow || targetRow.date !== date) {
    throw createError({ statusCode: 404, message: `No labs entry found for ${date}` })
  }

  const draws = [...rows.slice(0, -1).slice(-MAX_PRIOR_DRAWS), targetRow].map(r => ({
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

  const prompt = `You are writing a trend summary for a personal bloodwork dashboard. The reader is the person whose labs these are — address them as "you". They track their own biomarkers closely and understand them well. They run a self-directed hormone protocol whose core is testosterone (TRT), HGH, and hCG, with ancillary peptides rotating around that core, and they are weighing adding a mild anabolic (Primobolan or Anavar) for lean-mass goals — so markers that gate that decision (lipids, especially HDL; liver enzymes; hematocrit/hemoglobin; iron/ferritin; blood pressure proxies) deserve extra attention when present. They are not currently taking an aromatase inhibitor but keep Anastrozole on hand from their TRT clinic for symptomatic use; estradiol has been climbing and may read over 100 pg/mL on new draws. Treat elevated estradiol as a known, watched issue: quantify the trend against prior draws, name the specific symptoms and risks worth monitoring at that level, and frame the on-hand Anastrozole as the discussion point for symptom-driven use — not something to start reflexively.

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

Be factual, specific, and concise. If everything is stable and in range, say so briefly — do not manufacture concerns. No greeting, no closing, no medical-advice disclaimers or "consult your doctor" boilerplate. Plain text only — no markdown, no headers, no bullet characters.`

  const anthropic = new Anthropic({ apiKey })
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }]
  })

  const summary = response.content.find(b => b.type === 'text')?.text?.trim()
  if (!summary) {
    throw createError({ statusCode: 500, message: 'Summary generation returned no text' })
  }

  await db.prepare('UPDATE labs_entries SET ai_summary = ?2 WHERE date = ?1')
    .bind(date, summary)
    .run()

  return { ok: true, date, summary }
})
