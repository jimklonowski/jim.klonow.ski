// The owner's hand-written lab context as the client receives it (audit #43 item 48). The
// prose itself — which draw was run on which assay, what a medication does to a marker, the
// dated events — lives in server/data/markerCaveats.ts and server/data/protocolEvents.ts, where
// no page can import it into a public chunk. The client gets three things, each only for the
// signed-in roles and never for the demo sandbox:
//   - event bands {from, to, label} and the medication caveats, from GET /api/labs/notes;
//   - each draw's own assay notes, riding on the draw itself (LabsEntry.notes, keyed by marker)
//     from GET /api/labs/list — so every reader of a draw has its caveats in hand without a
//     second lookup, and a demo draw that happens to share a date carries none.
// The helpers below are the pure half, over those shapes.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { isBoundReading, readingOn, readingValueText, type ProvenancedDraw } from './labReadings.ts'
import type { EventBand } from './protocolEvents.ts'
import type { ProtocolRule } from './protocolRules.ts'
import { ruleActiveOn } from './protocolRules.ts'

/** A medication on the protocol that changes how a lab marker reads (the asterisk and the "on
 * <compound>" badge on its card). */
export interface MarkerCaveat {
  /** Protocol compound names (as logged) that skew this marker. */
  compounds: string[]
  /** Shown in the detail modal under the description, prefixed with the asterisk. */
  note: string
}

/** A caveat that belongs to ONE draw rather than to a medication: a different lab, a different
 * assay, a value censored at the instrument ceiling (the dagger). */
export interface ReadingNote {
  /** Draw date, YYYY-MM-DD. */
  date: string
  /** Shown in the detail modal, prefixed with the dagger and the draw date. */
  note: string
  /**
   * The value sits at the instrument's floor or ceiling and is a bound, not a measurement: the
   * home watch tile floats it as a hollow dot off the trend line. A note without it is
   * provenance (a different assay or lab) — the value is real, just not comparable with its
   * neighbours, so it keeps its place on the line and carries only the dagger.
   */
  censored?: boolean
}

/** GET /api/labs/notes. */
export interface LabNotes {
  events: EventBand[]
  caveats: Record<string, MarkerCaveat>
}

export const EMPTY_LAB_NOTES: LabNotes = { events: [], caveats: {} }

/** What the caveat needs of a protocol row: the compound and the dates it ran — a scored rule or a
 * standing med (finasteride moved from the dose log to the standing list in Oct 2026). */
export type CaveatSpan = Pick<ProtocolRule, 'compound' | 'from' | 'to'>

/**
 * The caveat compound in force on `date` for this marker, or null. `spans` is the protocol's
 * rules plus its standing meds (useProtocol: `[...rules, ...standing]`). PSA stays suppressed for
 * months after a 5-ARI stops, so a span's `to` date ends the flag a little early — acceptable for
 * a badge, and the note stays one click away.
 */
export function caveatCompoundOn(caveats: Record<string, MarkerCaveat>, key: string, date: string, spans: CaveatSpan[]): string | null {
  const caveat = caveats[key]
  if (!caveat) return null
  return spans.find(r => caveat.compounds.includes(r.compound) && ruleActiveOn(r, date))?.compound ?? null
}

/** A draw as the list serves it: its per-marker notes and provenance, when it has any. */
export interface NotedDraw extends ProvenancedDraw {
  notes?: Record<string, ReadingNote> | null
}

/** The note attached to this marker on the draw, or null. A missing draw has none. */
export function readingNoteOn(draw: NotedDraw | null | undefined, key: string): ReadingNote | null {
  return draw?.notes?.[key] ?? null
}

/**
 * A bound at the instrument's limit, not a measurement — a `censored` hand note, or a reading
 * the report printed with a < or > qualifier (item 72, data from the extractor): never the
 * "previous" reading a change is measured from, never an input to a derived marker, never a
 * point a two-marker comparison draws through (audit #43 item 15).
 */
export function isCensored(draw: NotedDraw | null | undefined, key: string): boolean {
  return readingNoteOn(draw, key)?.censored === true || isBoundReading(draw, key)
}

/**
 * Which way a censored reading is bounded: a `floor` was printed "<X" (the true value is lower —
 * LH on a suppressing protocol), a `ceiling` ">X" (the true value is higher — the Sep 9
 * immunoassay testosterone). `limit` is a hand note that says censored on a reading whose report
 * line carried no qualifier, so the direction is not on file.
 */
export type BoundKind = 'floor' | 'ceiling' | 'limit'

/** The reading's bound, or null for a measurement. */
export function boundKind(draw: NotedDraw | null | undefined, key: string): BoundKind | null {
  const qualifier = readingOn(draw, key)?.qualifier
  if (qualifier === '<') return 'floor'
  if (qualifier === '>') return 'ceiling'
  return readingNoteOn(draw, key)?.censored === true ? 'limit' : null
}

/**
 * The value as the report printed it: "<0.3" / ">1500", or the figure alone for a measurement
 * (and for a `limit`, whose direction is unknown). Every place a reading is printed uses this —
 * outside the history row a floor used to lose its "<" and read as a measured 0.3 (audit #44
 * item 23).
 */
export function boundValueText(value: number | string, draw: NotedDraw | null | undefined, key: string): string {
  return readingValueText(value, readingOn(draw, key))
}

/** "below the assay's floor" / "at the assay's ceiling" / "at the assay's limit" — then "a bound, not a measurement". */
export function boundPhrase(kind: BoundKind): string {
  return kind === 'floor' ? 'below the assay\'s floor' : kind === 'ceiling' ? 'at the assay\'s ceiling' : 'at the assay\'s limit'
}

// --- the draws as a prompt's fact sheet reads them ---

/** A draw with what a fact line needs: its values, and the notes and provenance riding on it. */
export interface FactDraw extends NotedDraw {
  date: string
  fasting?: boolean | null
  markers: Record<string, number | null | undefined>
}

/** What `labFactLines` puts above its lines: how to read a dagger and a "<" or ">". */
export const LAB_FACT_LEGEND = 'A value marked † has a note under the draws. A value printed with < or >, or noted as censored, is a bound at the assay\'s limit and not a measurement: do not report it as the level, and do not compute a change to or from it.'

/**
 * Every draw as one line of `key value` pairs — the /ask fact sheet's lab block — with each
 * reading printed as the report printed it and its notes listed after. The sheet used to select
 * the values alone, so the Sep 9 immunoassay ceiling reached the model as a plain
 * `testosterone_total 1500`, a measurement to quote and to diff (audit #44 item 32), though the
 * labs summary had daggered the same reading for months. A draw's line names its lab when the
 * provenance does. `notes` is one line per marked reading, in draw order: the hand note, or for a
 * printed bound with none, what the report printed.
 */
export function labFactLines(draws: readonly FactDraw[]): { lines: string[], notes: string[] } {
  const lines: string[] = []
  const notes: string[] = []
  for (const d of draws) {
    const parts: string[] = []
    const labs = new Set<string>()
    for (const [key, value] of Object.entries(d.markers)) {
      if (value == null) continue
      const prov = readingOn(d, key)
      if (prov?.lab) labs.add(prov.lab)
      const note = readingNoteOn(d, key)
      const bound = boundKind(d, key)
      const text = boundValueText(value, d, key)
      parts.push(`${key} ${text}${note || bound ? '†' : ''}`)
      const what = bound ? ` (${boundPhrase(bound)}: a bound, not a measurement)` : ''
      const source = [prov?.lab, prov?.assay].filter(Boolean).join(' ')
      if (note) notes.push(`† ${key} on ${d.date}${what}: ${note.note}`)
      else if (bound) notes.push(`† ${key} on ${d.date}${what}: the report printed it as ${text}${source ? `, ${source}` : ''}.`)
    }
    const tags = [d.fasting ? 'fasting' : '', [...labs].join(' + ')].filter(Boolean)
    lines.push(`${d.date}${tags.length ? ` (${tags.join(', ')})` : ''}: ${parts.join(', ')}`)
  }
  return { lines, notes }
}
