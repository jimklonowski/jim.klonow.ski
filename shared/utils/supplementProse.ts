// The supplement stack as AI-prompt prose, pure: given the rows — the supplements table today,
// protocol_items/protocol_versions after the cutover, which shared/utils/protocolStore.ts maps
// back to this row shape — the paragraphs every digest, summary and chat prompt carries. The D1
// read is server/utils/supplementContext.ts. Pronoun-free, like the rest of the prompt prose.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { shiftDays } from './dates.ts'
import type { Supplement } from '../types/journal.ts'

// How long a stopped supplement (or a fresh start) stays worth mentioning — matches the
// ~4-month protocol lookback the labs summary and digest trends already use.
export const CHANGE_RELEVANCE_DAYS = 120

/** A supplements row as the prose reads it: every column present, NULLs kept. */
export type SupplementRow = Pick<Required<Supplement>, 'name' | 'dose' | 'category' | 'status' | 'schedule' | 'started' | 'stopped' | 'notes'>

function describe(s: SupplementRow, recentSince: string): string {
  const parts = [s.name]
  if (s.dose) parts.push(s.dose)
  let out = parts.join(' ')
  if (s.schedule && s.schedule !== 'daily') out += ` (${s.schedule})`
  if (s.started && s.started >= recentSince) out += ` (started ${s.started})`
  if (s.notes) out += ` — ${s.notes}`
  return out
}

/**
 * The stack as it stood on `asOf` (YYYY-MM-DD), rendered as prompt paragraphs. asOf matters
 * because lab summaries can be (re)generated for historical draws: a supplement stopped after
 * the draw was still active then. '' when there is nothing to say.
 */
export function renderSupplementContext(rows: SupplementRow[], asOf: string): string {
  const recentSince = shiftDays(asOf, -CHANGE_RELEVANCE_DAYS)
  // A row stopped after asOf was still being taken at asOf; on_hand rows are never part of the
  // taken stack.
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
