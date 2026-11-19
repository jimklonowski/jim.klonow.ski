// Retest cadence (audit #43 item 66): how often each watched marker wants drawing again, and
// which ones are due. A marker's clock starts at its last reading; a flagged reading (the
// hematocrit ladder's watch rung at 50, a low ferritin, a liver enzyme over range) runs a
// shorter one. A booked draw near the due date covers it. /labs lists the due markers under the
// next draw, the "book these" preset carries them into the planned-draw form, and the calendar
// feed (item 58) dates each unbooked one. Pure; tests/retest.test.mjs pins every rule.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { diffDays, shiftDays } from './dates.ts'
import { estradiolKeyOn, isEstradiolKey } from './estradiol.ts'
import { OVERDUE_DAYS, isOpen, plannedDrawStates, type PlannedDraw } from './plannedDraws.ts'

export interface RetestRule {
  /** Days between readings while the last one was unremarkable. */
  days: number
  /** Days between readings while the last one was flagged (needs one of the three flag lines). */
  flaggedDays?: number
  /** A reading OVER this is flagged: the marker's reference ceiling, where its card turns HIGH. */
  flagAbove?: number
  /** A reading UNDER this is flagged: the marker's reference floor, where its card turns LOW. */
  flagBelow?: number
  /** A reading AT or over this is flagged: a rung that starts on its own figure (the hematocrit ladder's 50). */
  flagFrom?: number
}

/**
 * The cadences. 90 days is the quarterly TRT monitoring rhythm; the liver and lipid panels
 * run half-yearly unless out of range; PSA and vitamin D yearly. The hematocrit's 42 days at
 * 50 is the control panel's watch rung ("retest in 6 weeks"). Keyed by marker; the label and
 * unit come from BIOMARKERS where the number is shown.
 *
 * A flagAbove / flagBelow figure is the catalogue's reference bound and is read the way the card
 * reads it — over, under, never "at". Both used to count the bound itself, so a ferritin of
 * exactly 38 or an ALT of exactly 46 ran the short clock as "flagged" while its card read in
 * range (audit #44 item 26). The hematocrit rung is the one line that includes its figure, as
 * ladderRung does. LDL is the one figure that is not its card's: 130, the borderline-high line,
 * where the card turns HIGH over 100 — left as it was, so a reading between the two keeps the
 * half-yearly clock. tests/retest.test.mjs holds every other figure to the catalogue.
 */
export const RETEST_RULES: Record<string, RetestRule> = {
  hematocrit: { days: 90, flaggedDays: 42, flagFrom: 50 },
  ferritin: { days: 90, flaggedDays: 42, flagBelow: 38 },
  testosterone_total: { days: 90 },
  estradiol: { days: 90 },
  estradiol_sensitive: { days: 90 },
  igf1: { days: 180 },
  psa: { days: 365, flaggedDays: 90, flagAbove: 4 },
  ldl: { days: 180, flaggedDays: 90, flagAbove: 130 },
  triglycerides: { days: 180, flaggedDays: 90, flagAbove: 150 },
  hdl: { days: 180 },
  alt: { days: 180, flaggedDays: 42, flagAbove: 46 },
  ast: { days: 180, flaggedDays: 42, flagAbove: 40 },
  hba1c: { days: 180, flaggedDays: 90, flagAbove: 5.7 },
  vitamin_d: { days: 365, flaggedDays: 90, flagBelow: 30 }
}

/** How far ahead a due marker is listed. */
export const DUE_HORIZON_DAYS = 30

/** A draw as the cadence reads it. */
export interface RetestDraw {
  date: string
  markers: Record<string, number | null | undefined>
}

export interface MarkerDue {
  key: string
  /** The reading the clock started at. */
  last: { date: string, value: number }
  /** Whether that reading ran the shorter clock. */
  flagged: boolean
  cadenceDays: number
  /** YYYY-MM-DD the next reading is wanted by. */
  due: string
  /** Signed days from today to `due`; negative once overdue. */
  inDays: number
  /** The open plan that covers it (booked no later than OVERDUE_DAYS after the due date), or null. */
  planned: PlannedDraw | null
}

/** Whether a reading of `key` runs the flagged clock. */
export function isFlaggedReading(rule: RetestRule, value: number): boolean {
  if (rule.flaggedDays == null) return false
  if (rule.flagFrom != null && value >= rule.flagFrom) return true
  if (rule.flagAbove != null && value > rule.flagAbove) return true
  if (rule.flagBelow != null && value < rule.flagBelow) return true
  return false
}

/** "42-day cadence while 50 or over" / "42-day cadence while under 38" / "90-day cadence". */
export function cadenceText(rule: RetestRule, flagged: boolean): string {
  if (!flagged || rule.flaggedDays == null) return `${rule.days}-day cadence`
  const bound = rule.flagFrom != null ? `${rule.flagFrom} or over` : rule.flagAbove != null ? `over ${rule.flagAbove}` : `under ${rule.flagBelow}`
  return `${rule.flaggedDays}-day cadence while ${bound}`
}

/**
 * Every ruled marker with a reading on file whose next reading is due within DUE_HORIZON_DAYS
 * or overdue, soonest first. A marker never drawn has no clock. Only draws on or before `today`
 * count, so a view of an older day reads as that day did.
 */
export function markersDue(draws: readonly RetestDraw[], plans: readonly PlannedDraw[], today: string, rules: Record<string, RetestRule> = RETEST_RULES, horizonDays = DUE_HORIZON_DAYS): MarkerDue[] {
  const sorted = [...draws].filter(d => d.date <= today).sort((a, b) => a.date.localeCompare(b.date))
  const open = plannedDrawStates([...plans], sorted.map(d => d.date), today).filter(isOpen).map(s => s.plan)
  const out: MarkerDue[] = []
  // Estradiol's two assays run one clock (shared/utils/estradiol.ts): the newest draw that read
  // either restarts it, and the entry is the assay that draw is read by. The immunoassay's own
  // clock otherwise stayed overdue for good once a draw carried only the LC/MS/MS reading.
  const estradiolNow = estradiolKeyOn([...sorted].reverse().find(d => estradiolKeyOn(d) != null))
  for (const [key, rule] of Object.entries(rules)) {
    if (isEstradiolKey(key) && key !== estradiolNow) continue
    const last = [...sorted].reverse().find(d => d.markers[key] != null && Number.isFinite(d.markers[key]))
    if (!last) continue
    const value = last.markers[key] as number
    const flagged = isFlaggedReading(rule, value)
    const cadenceDays = flagged ? rule.flaggedDays! : rule.days
    const due = shiftDays(last.date, cadenceDays)
    const inDays = diffDays(today, due)
    if (inDays > horizonDays) continue
    const cover = shiftDays(due, OVERDUE_DAYS)
    const planned = open.filter(p => p.date <= cover).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
    out.push({ key, last: { date: last.date, value }, flagged, cadenceDays, due, inDays, planned })
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.key.localeCompare(b.key))
}

/** The date to book for a set of due markers: the soonest due date, but never before tomorrow. */
export function suggestedDrawDate(due: readonly MarkerDue[], today: string): string | null {
  const unbooked = due.filter(d => !d.planned)
  if (!unbooked.length) return null
  const soonest = unbooked[0]!.due
  const tomorrow = shiftDays(today, 1)
  return soonest > tomorrow ? soonest : tomorrow
}
