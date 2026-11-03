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

/** A draw as the list serves it: its per-marker notes, when it has any. */
export interface NotedDraw {
  notes?: Record<string, ReadingNote> | null
}

/** The note attached to this marker on the draw, or null. A missing draw has none. */
export function readingNoteOn(draw: NotedDraw | null | undefined, key: string): ReadingNote | null {
  return draw?.notes?.[key] ?? null
}

/**
 * A bound at the instrument's limit, not a measurement (a `censored` note): never the "previous"
 * reading a change is measured from, never an input to a derived marker, never a point a
 * two-marker comparison draws through (audit #43 item 15).
 */
export function isCensored(draw: NotedDraw | null | undefined, key: string): boolean {
  return readingNoteOn(draw, key)?.censored === true
}
