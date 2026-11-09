// Injection-relative draw timing, as the pages show it (audit #43 item 61). A testosterone or
// estradiol reading depends heavily on how long after the shot the blood was drawn — a draw a
// day after reads near peak, one the morning of the next shot near trough — so every draw gets
// a chip ("51 h after T · ≈62 % of peak") from the same Bateman model the AI summary already
// uses (shared/utils/pk.ts), and a draw being planned is compared with past draws: the schedule
// says which weekday the last shot before it falls on, the dose log says when past draws fell.
// Relative shape only, never measured levels — the chip's title says so.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { diffDays, shiftDays } from './dates.ts'
import { PK_MODELS, drawTiming, pkDosesFor, type DrawTiming } from './pk.ts'
import { ruleActiveOn, type ProtocolRule } from './protocolRules.ts'

/** How a modeled compound reads in a chip: the hormone it carries, not the ester. */
export const COMPOUND_SHORT: Record<string, string> = {
  'Testosterone Cypionate': 'T',
  'Testosterone Enanthate': 'T',
  'Testosterone Propionate': 'T',
  'Sustanon 250': 'T',
  'Methenolone Enanthate': 'Primo',
  'Nandrolone Decanoate': 'Deca',
  'hCG': 'hCG'
}

export const TIMING_CAVEAT = 'Bateman-modeled from the dose log with typical half-lives — relative shape, not a measured level'

type LoggedDay = Parameters<typeof pkDosesFor>[0][number]

export interface TimingChip {
  compound: string
  short: string
  /** Hours from the last shot to the (morning) draw. */
  hours: number
  timing: DrawTiming
  /** "51 h after T · ≈62 % of peak" */
  text: string
}

/** One chip per modeled compound with a shot recent enough to matter at `date`. */
export function drawTimingChips(journal: readonly LoggedDay[], date: string): TimingChip[] {
  const out: TimingChip[] = []
  for (const [compound, model] of Object.entries(PK_MODELS)) {
    const timing = drawTiming(pkDosesFor([...journal], compound, model), model, date)
    if (!timing) continue
    const short = COMPOUND_SHORT[compound] ?? compound
    const hours = Math.round(timing.daysSinceLastDose * 24)
    out.push({ compound, short, hours, timing, text: `${hours} h after ${short} · ≈${timing.pctOfRecentPeak} % of peak` })
  }
  return out
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Days from the last scheduled shot before a morning draw on `date` to that draw: 1–7. A shot
 * scheduled on the draw day itself comes after a fasted morning draw (drawTiming's rule), so it
 * is the week-earlier one that counts. Null without weekdays.
 */
export function scheduledDaysBefore(weekdays: readonly number[], date: string): { days: number, weekday: string } | null {
  if (!weekdays.length) return null
  const dow = new Date(date + 'T12:00:00Z').getUTCDay()
  for (let back = 1; back <= 7; back++) {
    const d = (dow - back + 7) % 7
    if (weekdays.includes(d)) return { days: back, weekday: DAY_NAMES[d]! }
  }
  return null
}

export type TimingMatch = 'matches' | 'earlier' | 'later' | 'no history'

export interface PlannedTimingRow {
  compound: string
  short: string
  /** Days from the scheduled shot to the planned draw, and the shot's weekday. */
  projected: { days: number, weekday: string }
  /** Days-since-shot at each past draw that had a recent shot, oldest first. */
  past: number[]
  /** The median of `past`, one decimal; null without history. */
  typical: number | null
  match: TimingMatch
  /** "T: 1 d after the Thu shot — past draws 1.9–2.1 d → earlier than usual" */
  text: string
}

/** A planned draw differs from habit when it sits this many days or more off the median. */
export const TIMING_TOLERANCE_DAYS = 1

function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return Math.round((s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2) * 10) / 10
}

/**
 * For a draw planned on `date`: each modeled compound the schedule runs that day, where the
 * draw lands against its last scheduled shot, and where past draws (the dates in `drawDates`)
 * landed against the logged shots — so the new draw can be booked on the usual day, or the
 * difference known before the numbers are read.
 */
export function plannedTimingRows(rules: readonly ProtocolRule[], journal: readonly LoggedDay[], drawDates: readonly string[], date: string): PlannedTimingRow[] {
  const out: PlannedTimingRow[] = []
  for (const [compound, model] of Object.entries(PK_MODELS)) {
    const rule = rules.find(r => r.compound === compound && ruleActiveOn(r, date))
    if (!rule) continue
    const projected = scheduledDaysBefore(rule.weekdays, date)
    if (!projected) continue
    const doses = pkDosesFor([...journal], compound, model)
    const past = drawDates
      .filter(d => d < date)
      .map(d => drawTiming(doses, model, d)?.daysSinceLastDose)
      .filter((v): v is number => v != null)
    const typical = median(past)
    const short = COMPOUND_SHORT[compound] ?? compound
    let match: TimingMatch = 'no history'
    if (typical != null) {
      const off = projected.days - typical
      match = Math.abs(off) < TIMING_TOLERANCE_DAYS ? 'matches' : off < 0 ? 'earlier' : 'later'
    }
    const range = past.length ? `${Math.min(...past)}–${Math.max(...past)} d` : ''
    const verdict = match === 'no history' ? 'no past draw to compare' : match === 'matches' ? 'like past draws' : `${match} than usual, so expect ${match === 'earlier' ? 'higher' : 'lower'} ${short}`
    out.push({
      compound,
      short,
      projected,
      past,
      typical,
      match,
      text: `${short}: ${projected.days} d after the ${projected.weekday} shot${past.length ? ` — past draws ${past.length === 1 ? `${past[0]} d` : range}` : ''} → ${verdict}`
    })
  }
  return out
}

/** The nearest dates to `date` that would land on the usual day for every compound, for a hint. */
export function usualDrawDates(rules: readonly ProtocolRule[], journal: readonly LoggedDay[], drawDates: readonly string[], date: string, span = 7): string[] {
  const dates: string[] = []
  for (let off = -span; off <= span; off++) {
    const d = shiftDays(date, off)
    if (d === date) continue
    const rows = plannedTimingRows(rules, journal, drawDates, d)
    if (rows.length && rows.every(r => r.match === 'matches')) dates.push(d)
  }
  return dates.sort((a, b) => Math.abs(diffDays(date, a)) - Math.abs(diffDays(date, b)))
}
