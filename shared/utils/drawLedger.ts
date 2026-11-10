// The draw ledger (audit #43 item 64): one row per blood draw answering "what was I on, how
// long after the shot, and what did the gating markers read?" — the protocol in force that day
// (from the schedule's rules, at the dose step then current), the injection-relative timing
// (shared/utils/drawTimingView.ts), and the five markers that gate the hormone protocol with
// their change from the previous reading. Pure; /labs/ledger renders it.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { COMPOUND_SHORT, drawTimingChips, type TimingChip } from './drawTimingView.ts'
import { readingTags, transitionalWindows, type Phlebotomy, type ReadingTag } from './hematocrit.ts'
import { isCensored, readingNoteOn, type NotedDraw } from './labNotes.ts'
import { PK_MODELS } from './pk.ts'
import type { pkDosesFor } from './pk.ts'
import { doseStepOn, ruleActiveOn, type ProtocolRule } from './protocolRules.ts'

/** The markers a row carries, in column order. */
export const LEDGER_MARKERS = ['testosterone_total', 'testosterone_free', 'estradiol', 'hematocrit', 'ferritin'] as const
export type LedgerMarker = typeof LEDGER_MARKERS[number]

/** A draw as the ledger reads it. */
export interface LedgerDraw extends NotedDraw {
  date: string
  fasting?: boolean | null
  markers: Record<string, number | null | undefined>
}

type LoggedDay = Parameters<typeof pkDosesFor>[0][number]

export interface ProtocolCell {
  compound: string
  /** "T", "hCG", "HGH" — the hormone, not the ester. */
  short: string
  /** The dose label in force that day: "75 mg". */
  label: string
  /** Doses a week on the rule's weekdays. */
  perWeek: number
  /** "150 mg/wk" when the label parses to a number and unit; else "75 mg ×2/wk". */
  text: string
}

export interface MarkerCell {
  value: number | null
  /** A bound at the assay's limit: shown daggered, never diffed. */
  censored: boolean
  /** A per-reading note (a different assay or lab) rides on this value. */
  noted: boolean
  /** Change from the previous usable reading of this marker; null without one. */
  delta: number | null
  /** The previous reading's date, for the title. */
  since: string | null
  /** Why the value may not mean what it says (a turnover window, a recent phlebotomy) — item 101. */
  tags: ReadingTag[]
}

export interface LedgerRow {
  date: string
  fasting: boolean
  protocol: ProtocolCell[]
  timing: TimingChip[]
  cells: Record<LedgerMarker, MarkerCell>
}

const SHORT: Record<string, string> = { ...COMPOUND_SHORT, HGH: 'HGH', Somatropin: 'HGH' }

/** "75 mg" → { amount: 75, unit: 'mg' }; null for anything that doesn't lead with a number. */
export function parseDoseLabel(label: string): { amount: number, unit: string } | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([a-zA-Zµ]+)/.exec(label)
  return m ? { amount: Number(m[1]), unit: m[2]! } : null
}

const fmtAmount = (n: number) => Number(n.toFixed(2)).toString()

/**
 * The compounds the schedule had running on `date` that the ledger cares about — the modeled
 * injectables and anything else marked injected (HGH) — at the dose step in force that day.
 */
export function protocolOn(rules: readonly ProtocolRule[], date: string): ProtocolCell[] {
  const out: ProtocolCell[] = []
  for (const r of rules) {
    if (!ruleActiveOn(r, date)) continue
    if (!(r.compound in PK_MODELS) && !r.injected) continue
    const label = doseStepOn(r, date).step?.label ?? r.doseLabel
    const perWeek = r.weekdays.length
    const parsed = parseDoseLabel(label)
    const text = parsed ? `${fmtAmount(parsed.amount * perWeek)} ${parsed.unit}/wk` : `${label} ×${perWeek}/wk`
    out.push({ compound: r.compound, short: SHORT[r.compound] ?? r.compound, label, perWeek, text })
  }
  return out
}

/** The ledger, newest draw first. Deltas are against the previous usable reading of the same marker. */
export function ledgerRows(draws: readonly LedgerDraw[], journal: readonly LoggedDay[], rules: readonly ProtocolRule[], phlebotomies: readonly Phlebotomy[] = []): LedgerRow[] {
  const sorted = [...draws].sort((a, b) => a.date.localeCompare(b.date))
  const last: Partial<Record<LedgerMarker, { value: number, date: string }>> = {}
  const windows = transitionalWindows(rules)
  const rows: LedgerRow[] = []
  for (const d of sorted) {
    const cells = {} as Record<LedgerMarker, MarkerCell>
    for (const key of LEDGER_MARKERS) {
      const raw = d.markers[key]
      const value = raw != null && Number.isFinite(raw) ? raw : null
      const censored = value != null && isCensored(d, key)
      const prev = last[key]
      const usable = value != null && !censored
      cells[key] = {
        value,
        censored,
        noted: readingNoteOn(d, key) != null,
        delta: usable && prev ? Number((value - prev.value).toFixed(1)) : null,
        since: usable && prev ? prev.date : null,
        tags: value != null ? readingTags(key, d.date, windows, phlebotomies) : []
      }
      if (usable) last[key] = { value, date: d.date }
    }
    rows.push({ date: d.date, fasting: d.fasting === true, protocol: protocolOn(rules, d.date), timing: drawTimingChips(journal, d.date), cells })
  }
  return rows.reverse()
}

/** "T 150 mg/wk · hCG 500 IU/wk · HGH 14 IU/wk" */
export function protocolText(cells: readonly ProtocolCell[]): string {
  return cells.map(c => `${c.short} ${c.text}`).join(' · ')
}

/** "980 (−200)" / "1500†" / "—" */
export function cellText(cell: MarkerCell): string {
  if (cell.value == null) return '—'
  const v = Number(cell.value.toFixed(1)).toString()
  if (cell.censored) return `${v}†`
  if (cell.delta == null) return v
  const sign = cell.delta > 0 ? '+' : cell.delta < 0 ? '−' : '±'
  return `${v} (${sign}${Math.abs(cell.delta)})`
}
