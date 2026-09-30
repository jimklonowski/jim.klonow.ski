// Protocol context drawn onto the time-series charts: when a dose changed, when a compound
// started or stopped, and the spans of dated events and cycles. Built from the same hand-
// maintained sources the AI prompts read (PROTOCOL_RULES' dose steps, PROTOCOL_EVENTS) plus the
// user's cycles, so "did BP move after the T cut?" is answerable at a glance instead of by
// remembering the date.
//
// Two steps, both pure: collect the annotations as dated facts, then place them on a chart's
// category axis, whose points are only the days that have data. Placement snaps to the nearest
// point that honestly represents the date (the first reading on or after a change; a band's
// first and last readings inside its span) and drops anything outside the visible data, so a
// change before the window never lands on its first point and reads as if it happened there.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { shiftDays } from './dates.ts'
import type { ProtocolEvent } from './protocolEvents.ts'
import type { ProtocolRule } from './protocolRules.ts'

export type AnnotationKind = 'dose' | 'event' | 'cycle'

export interface ChartAnnotation {
  kind: AnnotationKind
  /** YYYY-MM-DD. A line for a dose change; the first day of a band. */
  from: string
  /** Last day of a band, inclusive. Absent for a line. */
  to?: string
  /** Short: "T 100→75 mg", "Vorck Ferritin Protocol". */
  text: string
}

/** A cycle, reduced to what a chart band needs (shared/utils/cycles.ts derives these). */
export interface CycleSpan {
  name: string
  from: string
  to: string
}

// Chart text is tight; the long compound names become the shorthand the dossiers already use.
const SHORT_NAMES: Record<string, string> = {
  'Testosterone Cypionate': 'T',
  'Testosterone Enanthate': 'TE',
  'GHK-Cu': 'GHK'
}
const shortName = (compound: string) => SHORT_NAMES[compound] ?? compound

/** "100 mg" → "75 mg" reads "100→75 mg"; different units keep both. */
function stepText(previous: string, next: string): string {
  const unit = (label: string) => label.replace(/^[\d.,\s]+/, '').trim()
  const amount = (label: string) => label.match(/^[\d.,]+/)?.[0] ?? label
  return unit(previous) && unit(previous) === unit(next)
    ? `${amount(previous)}→${next}`
    : `${previous}→${next}`
}

/** Every dose change, start and stop in the standing rules. */
export function ruleAnnotations(rules: ProtocolRule[]): ChartAnnotation[] {
  const out: ChartAnnotation[] = []
  for (const rule of rules) {
    const name = shortName(rule.compound)
    const steps = rule.doses ?? []
    out.push({ kind: 'dose', from: rule.from, text: `${name} start ${steps[0]?.label ?? rule.doseLabel}` })
    for (let i = 1; i < steps.length; i++) {
      out.push({ kind: 'dose', from: steps[i]!.from, text: `${name} ${stepText(steps[i - 1]!.label, steps[i]!.label)}` })
    }
    if (rule.to) out.push({ kind: 'dose', from: shiftDays(rule.to, 1), text: `${name} stop` })
  }
  return out
}

/** Dated events that carry a chart label. Unlabeled ones stay prompt-only context. */
export function eventAnnotations(events: ProtocolEvent[]): ChartAnnotation[] {
  return events
    .filter((e): e is ProtocolEvent & { label: string } => !!e.label)
    .map(e => ({ kind: 'event' as const, from: e.from, to: e.to ?? e.from, text: e.label }))
}

export function cycleAnnotations(cycles: CycleSpan[]): ChartAnnotation[] {
  return cycles.map(c => ({ kind: 'cycle' as const, from: c.from, to: c.to, text: c.name }))
}

export interface PlacedAnnotation {
  kind: AnnotationKind
  text: string
  /** The day (YYYY-MM-DD category value) the line sits on, or the band's first. */
  at: string
  /** The band's last day. Absent for a line. */
  end?: string
  /** The dates as they happened, for the key: "Aug 24", "Sep 18–27". */
  from: string
  to?: string
}

/**
 * Places annotations on a chart whose points are `dates` (YYYY-MM-DD, ascending). A line lands on
 * the first point on or after its date, and only if that date is within the data; a band covers
 * its first through last point inside its span, clipped to the data, and is dropped when no point
 * falls inside it.
 *
 * `at`/`end` stay ISO days — the chart's category VALUES must be days too, with any prettier text
 * applied by a display formatter (AreaChart does this). Placing onto formatted labels was the
 * wrong-year bug: "Aug 24" names a day in every year of an all-time range, so echarts drew the
 * line on the last year's match while the tooltip lookup found the first's.
 */
export function placeAnnotations(annotations: ChartAnnotation[], dates: string[]): PlacedAnnotation[] {
  if (!dates.length) return []
  const first = dates[0]!
  const last = dates.at(-1)!
  const placed: PlacedAnnotation[] = []
  for (const a of annotations) {
    if (a.to == null) {
      if (a.from < first || a.from > last) continue
      const at = dates.find(d => d >= a.from)
      if (at) placed.push({ kind: a.kind, text: a.text, at, from: a.from })
      continue
    }
    const inside = dates.filter(d => d >= a.from && d <= a.to!)
    if (!inside.length) continue
    placed.push({ kind: a.kind, text: a.text, at: inside[0]!, end: inside.at(-1)!, from: a.from, to: a.to })
  }
  return placed.sort((x, y) => x.from.localeCompare(y.from))
}

/**
 * The annotations covering one category, for a hover tooltip: lines on it, bands spanning it.
 * `order` is the chart's category list, so a band's span can be tested by position.
 */
export function annotationsAt(placed: PlacedAnnotation[], category: string, order: string[]): PlacedAnnotation[] {
  const i = order.indexOf(category)
  if (i === -1) return []
  return placed.filter((p) => {
    if (p.end == null) return p.at === category
    return order.indexOf(p.at) <= i && i <= order.indexOf(p.end)
  })
}
