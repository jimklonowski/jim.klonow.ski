// Dated one-off events for the AI prompts: things the data streams can't explain on their own —
// travel, a draw-day deviation, an illness. Hand-maintained like the rules in ./protocolRules.ts,
// but each entry is dated and ages out of the prompts by itself (eventContext), so the list only
// ever grows; never prune an entry to "fix" a prompt. Each note says how to READ the data around
// it, not just what happened — the model sees the same dose log and vitals and would otherwise
// narrate the gap as a lapse. Pronoun-free, like the rest of the prompt prose.
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
  /** Pronoun-free prose. */
  note: string
}

// Three weeks: long enough that a draw the week after a disruption still sees it, short enough
// that a weekend of missed doses isn't still being explained in October.
const EVENT_RELEVANCE_DAYS = 21

export const PROTOCOL_EVENTS: ProtocolEvent[] = [
  {
    from: '2026-09-05',
    to: '2026-09-07',
    note: 'Labor Day weekend travel, Sat 2026-09-05 through Mon 2026-09-07. The trip — not a protocol change — disrupted dosing: HGH was missed on 09-06 and 09-07, the Sunday hCG dose (09-06) was skipped, and the Monday testosterone injection went in around 12:45 on 09-07 instead of the usual ~04:15 slot (it is logged at its actual time). Read the gap as travel, never as a stop, a taper, or an adherence trend, and mention it once rather than as a recurring headline. Modeled HGH exposure sits a little under steady state for a few days afterwards, so IGF-1 on a draw within the following week may read somewhat below its usual level.'
  },
  {
    from: '2026-09-09',
    // The draw itself is only news for a couple of days. The labs summary for this date always
    // sees the note regardless, because that prompt's asOf IS the draw date.
    relevanceDays: 3,
    note: 'Bloodwork was drawn 2026-09-09 at about 07:50. The morning oral stack — finasteride and iron included — was deliberately held until after the draw, so none of that day\'s orals were on board in the sample; this matters most for serum iron, which a same-morning iron dose would inflate, and marginally for DHT. COVID-19, influenza, and tetanus vaccines followed at about 08:30 — after the blood was taken, so they cannot have influenced this draw\'s results (see the vaccination context for the days after). Total testosterone on this panel was run by immunoassay rather than LC/MS-MS, and that assay reports only as high as 1500 ng/dL: the reported 1500 is a censored ceiling meaning "at least 1500", not a measured value, and the panel carried its own 264-916 ng/dL reference range rather than the usual one. Never read it as a fall from the 2211 measured by LC/MS-MS on 2026-08-15, never compute a delta against it, and never cite it as evidence for or against the effect of the testosterone dose reduction.'
  },
  {
    from: '2026-09-18',
    // Adjust `to` to the actual last day — the run is 7 to 10 days and 09-27 is the 10-day end.
    // 30 days (rather than the default 21) so the 2026-10-17 labs summary still sees this note
    // even if the protocol is cut short at 7 days; that draw's iron panel is unreadable without it.
    to: '2026-09-27',
    relevanceDays: 30,
    note: 'Deliberate short iron-loading protocol, 2026-09-18 through about 2026-09-27: 75 mg iron bisglycinate three times a day at roughly 08:00, 14:00, and 20:00, about 225 mg/day elemental, replacing the standing 50 mg once-daily iron supplement for the duration. The goal is the opposite of ordinary iron repletion. An oral dose above 60 mg raises hepcidin for about 24 hours and blunts absorption of any later dose, so splitting the dose deliberately holds hepcidin high, which traps iron recycled from senescent red cells in storage instead of releasing it into erythropoiesis. Read this as a bounded experiment aimed at raising ferritin from a low baseline, never as a permanent supplement change, a dosing error, or a sign of iron-deficiency treatment as usual. Vitamin D, vitamin C, alcohol, and intense sun or tanning bed exposure are all held for the duration because each lowers hepcidin and would work against the protocol; those gaps are part of the plan and must never be reported as missed doses, a stopped supplement, or an adherence lapse. Some GI upset is expected at this dose and is not a new symptom to investigate. Hematocrit and hemoglobin are NOT expected to fall: red cell mass turns over at only about 1 percent per day, so a ten-day intervention cannot meaningfully reduce it, and flat counts alongside a higher ferritin is the intended result rather than a disappointment. Any serum iron, transferrin saturation, or ferritin measured during the protocol or within roughly a week after reflects an acute iron load and not a steady-state iron store, so treat such a value as inflated and say so. The baseline to compare against is the 2026-08-15 panel: ferritin 16 ng/mL, saturation 17 percent, TIBC 330 mcg/dL, serum iron 56 mcg/dL.'
  }
]

// The dated notes in force on `asOf`: begun by then and not yet past their relevance window.
export function eventContext(asOf: string, events: ProtocolEvent[] = PROTOCOL_EVENTS): string {
  const active = events.filter((e) => {
    const last = e.to ?? e.from
    return e.from <= asOf && diffDays(last, asOf) <= (e.relevanceDays ?? EVENT_RELEVANCE_DAYS)
  })
  if (!active.length) return ''
  return `Dated notes — one-off context the data streams can't explain on their own (travel, draw-day deviations). Use these before speculating about anomalies in the same window, and don't re-headline them once the window has passed:\n${active.map(e => `- ${e.note}`).join('\n')}`
}
