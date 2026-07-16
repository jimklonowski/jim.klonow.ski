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

function refRange(key: string): string {
  const meta = BIOMARKERS[key]
  if (!meta) return ''
  if (meta.refMin != null && meta.refMax != null) return `ref ${meta.refMin}-${meta.refMax}`
  if (meta.refMin != null) return `ref >=${meta.refMin}`
  if (meta.refMax != null) return `ref <=${meta.refMax}`
  return ''
}

export default defineEventHandler(async (event) => {
  requireLabsAuth(event)
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

  const prompt = `You are writing a short trend summary for a personal bloodwork dashboard. The reader is the person whose labs these are — address them as "you". They track their own biomarkers closely and understand them well.

New draw: ${date} (${target.fasting ? 'fasting' : 'non-fasting'})
Draws included for comparison: ${draws.map(d => `${d.date}${d.fasting ? ' (fasting)' : ' (non-fasting)'}`).join(', ')}

Marker history (oldest -> newest, "NEW" marks the new draw):
${markerLines.join('\n')}
${qualitativeBlock}
Write 2-4 short paragraphs, in order of importance:
1. The most significant changes versus the previous draw, with specific numbers and % change.
2. Any values in the new draw outside their reference range.
3. Notable trends across multiple draws (steady climbs or declines).

Be factual, specific, and concise. If everything is stable and in range, say so briefly — do not manufacture concerns. No greeting, no closing, no medical-advice disclaimers or "consult your doctor" boilerplate. Plain text only — no markdown, no headers, no bullet characters.`

  const anthropic = new Anthropic({ apiKey })
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
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
