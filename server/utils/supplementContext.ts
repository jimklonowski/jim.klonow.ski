// The vitamin/supplement/skin stack as AI-prompt context. It lives in the `supplements` table and
// is rendered per request, so edits on /journal/supplements flow into the prompts without a
// deploy. Pronoun-free, like the rest of the prompt prose.
import { shiftDays } from '#shared/utils/dates'
import type { Supplement } from '#shared/types/journal'

// How long a stopped supplement (or a fresh start) stays worth mentioning — matches the
// ~4-month protocol lookback the labs summary and digest trends already use.
const CHANGE_RELEVANCE_DAYS = 120

// A supplements row as read below: every column present, NULLs kept.
type SupplementRow = Pick<Required<Supplement>, 'name' | 'dose' | 'category' | 'status' | 'schedule' | 'started' | 'stopped' | 'notes'>

function describe(s: SupplementRow, recentSince: string): string {
  const parts = [s.name]
  if (s.dose) parts.push(s.dose)
  let out = parts.join(' ')
  if (s.schedule && s.schedule !== 'daily') out += ` (${s.schedule})`
  if (s.started && s.started >= recentSince) out += ` (started ${s.started})`
  if (s.notes) out += ` — ${s.notes}`
  return out
}

// The supplement stack as it stood on `asOf` (YYYY-MM-DD), rendered as prompt paragraphs.
// asOf matters because lab summaries can be (re)generated for historical draws: a supplement
// stopped after the draw was still active then. Returns '' when there's nothing to say —
// including when the table doesn't exist yet, so digest generation never dies on a missing
// migration.
export async function supplementContext(db: D1Database, asOf: string): Promise<string> {
  let rows: SupplementRow[]
  try {
    const { results } = await db.prepare(
      'SELECT name, dose, category, status, schedule, started, stopped, notes FROM supplements ORDER BY sort ASC, name ASC'
    ).all()
    rows = (results ?? []) as unknown as SupplementRow[]
  }
  catch {
    return ''
  }

  const recentSince = shiftDays(asOf, -CHANGE_RELEVANCE_DAYS)
  // A row stopped after asOf was still being taken at asOf (lab summaries can regenerate
  // for historical draws); on_hand rows are never part of the taken stack.
  const activeAt = (s: SupplementRow) =>
    s.status !== 'on_hand'
    && (s.started == null || s.started <= asOf)
    && (s.stopped == null || s.stopped > asOf)

  const oral = rows.filter(s => s.category !== 'skin' && activeAt(s))
  const skin = rows.filter(s => s.category === 'skin' && activeAt(s))
  const onHand = rows.filter(s => s.status === 'on_hand')
  const recentlyStopped = rows.filter(s => s.stopped != null && s.stopped <= asOf && s.stopped >= recentSince)

  const paragraphs: string[] = []
  if (oral.length) {
    paragraphs.push(`Daily oral stack, taken consistently but mostly NOT logged in the journal (absence from dose logs is not a lapse): ${oral.map(s => describe(s, recentSince)).join('; ')}.`)
  }
  if (skin.length) {
    paragraphs.push(`Skin/hair routine: ${skin.map(s => describe(s, recentSince)).join('; ')}.`)
  }
  if (recentlyStopped.length) {
    paragraphs.push(`Recently discontinued: ${recentlyStopped.map(s => `${s.name} (stopped ${s.stopped}${s.notes ? `; ${s.notes.toLowerCase()}` : ''})`).join('; ')}.`)
  }
  if (onHand.length) {
    paragraphs.push(`On hand but NOT currently being taken (do not treat as active exposure; relevant to pending decisions like the anabolic question): ${onHand.map(s => describe(s, recentSince)).join('; ')}.`)
  }
  return paragraphs.join('\n\n')
}
