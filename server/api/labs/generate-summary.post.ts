import { zSummaryGenerate } from '#shared/utils/schemas'
import { BIOMARKERS } from '../../../app/data/biomarkers'
import { readingNoteOn } from '../../../app/data/markerCaveats'
import { eventContext } from '#shared/utils/protocolEvents'

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

  // A reading with its own note (READING_NOTES: a censored ceiling, a different assay) gets a
  // dagger in its history line and the note printed below the history. Without this the model
  // read the Sep 9 immunoassay "1500" as a measurement and computed a change against it, and
  // trended an immunoassay estradiol against an ultrasensitive one.
  const readingNotes: string[] = []
  const markerLines = keys.map((key) => {
    const meta = BIOMARKERS[key]
    const label = meta?.label ?? key
    const bracket = [meta?.unit, refRange(key)].filter(Boolean).join(', ')
    const head = `${label}${bracket ? ` [${bracket}]` : ''}`
    const history = draws
      .filter(d => d.markers[key] != null)
      .map((d) => {
        const note = readingNoteOn(key, d.date)
        if (note) readingNotes.push(`† ${label} on ${d.date}${note.censored ? ' (censored at the instrument limit)' : ''}: ${note.note}`)
        return `${d.date === date ? 'NEW ' : ''}${d.date}: ${d.markers[key]}${note ? ' †' : ''}`
      })
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
  // A draw booked for this date (or one that landed within a few days of its plan) carries the
  // questions it was meant to answer, and the summary opens with them.
  const plannedBlock = await plannedDrawContext(db, date)

  // The standing schedule (the protocol tables, or the code constants until seeded); the prompt
  // renders it as of the draw date.
  const protocol = await protocolFor(event)

  // The wording lives in server/utils/summaryPrompts.ts beside the digest's and the DEXA's.
  const prompt = labsSummaryPrompt({
    date, fasting: target.fasting, protocol, draws, protocolBlock, supplementBlock, cycleBlock, vaccineBlock, eventBlock, plannedBlock, markerLines, readingNotes, qualitativeBlock
  })

  const startedAt = Date.now()
  let response
  try {
    response = await createAnthropic(SUMMARY_CLIENT_OPTIONS).messages.create({
      model: AI_MODELS.summary,
      // ~600 words of prose plus the step lines. The old 2048 cap could truncate a summary of a
      // wide panel mid-sentence, and the truncated text was stored as though it were finished.
      // Adaptive thinking shares the max_tokens budget with the prose, hence the headroom.
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
  // Audited like every other owner write on the row: a regeneration replaces the prose and its
  // provenance, and a worse rewrite (or a prompt change that regressed) is otherwise gone for good.
  const before = await auditBefore(event, 'labs_entries', date)
  await db.prepare(`
    UPDATE labs_entries
    SET ai_summary = ?2, ai_summary_model = ?3, ai_summary_prompt_hash = ?4, ai_summary_at = ?5
    WHERE date = ?1
  `).bind(date, summary, provenance.model, provenance.promptHash, provenance.at).run()
  await recordAudit(event, { table: 'labs_entries', key: date, before, summary: `AI summary for the ${date} draw` })

  return { ok: true, date, summary, ...provenance }
})
