// Dated one-off events and goal statements for the AI prompts — the SHAPES and the prose
// builders only. The entries themselves (the owner's travel, draw-day deviations, a course of
// medication: personal context in plain prose) live in server/data/protocolEvents.ts, so they
// never reach the client bundle, which anyone can download (audit #43 item 48). The trend charts
// get only what a band needs, {from, to, label}, through /api/labs/notes.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { diffDays } from './dates.ts'

export interface ProtocolEvent {
  /** First day, YYYY-MM-DD. */
  from: string
  /** Last day, inclusive. Omit for a single-day event. */
  to?: string
  /** Days after `to` the note keeps appearing in prompts; defaults to EVENT_RELEVANCE_DAYS. */
  relevanceDays?: number
  /**
   * A few words for the band drawn on the trend charts (shared/utils/chartAnnotations.ts).
   * Omit it and the event stays prompt-only: the draw-day note has the draw guides already, and
   * the iron protocol is also the "Vorck Ferritin Protocol" cycle, which draws its own band.
   */
  label?: string
  /** Pronoun-free prose. */
  note: string
}

/** What a chart band needs of an event — all the client is ever sent. */
export type EventBand = Pick<ProtocolEvent, 'from' | 'to'> & { label: string }

export interface ProtocolGoal {
  /** The day the goal was stated, YYYY-MM-DD. It holds until a later entry supersedes it. */
  from: string
  /** Pronoun-free prose: the targets, the reasoning behind them, and how to read a draw against them. */
  note: string
}

// Three weeks: long enough that a draw the week after a disruption still sees it, short enough
// that a weekend of missed doses isn't still being explained in October.
export const EVENT_RELEVANCE_DAYS = 21

/** The labelled events as bands, and nothing else of them — the note never comes along. */
export function eventBands(events: ProtocolEvent[]): EventBand[] {
  return events.flatMap(e => e.label ? [{ from: e.from, ...(e.to ? { to: e.to } : {}), label: e.label }] : [])
}

/** The goal statement in force on `asOf`: the latest one stated by then, or '' before the first. */
export function goalContext(asOf: string, goals: ProtocolGoal[]): string {
  const current = goals.filter(g => g.from <= asOf).at(-1)
  if (!current) return ''
  return `Current goals (stated ${current.from}) — the frame for reading lab draws, not something to restate in a day's recap: ${current.note}`
}

// The dated notes in force on `asOf`: begun by then and not yet past their relevance window.
export function eventContext(asOf: string, events: ProtocolEvent[]): string {
  const active = events.filter((e) => {
    const last = e.to ?? e.from
    return e.from <= asOf && diffDays(last, asOf) <= (e.relevanceDays ?? EVENT_RELEVANCE_DAYS)
  })
  if (!active.length) return ''
  return `Dated notes — one-off context the data streams can't explain on their own (travel, draw-day deviations). Use these before speculating about anomalies in the same window, and don't re-headline them once the window has passed:\n${active.map(e => `- ${e.note}`).join('\n')}`
}
