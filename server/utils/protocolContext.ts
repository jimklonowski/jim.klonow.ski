import { PK_MODELS, drawTiming, pkDosesFor } from '#shared/utils/pk'
import { shiftDays } from '#shared/utils/dates'
import { detectProtocolChanges, type TrendJournalRow } from '#shared/utils/trends'

// Dose history window fed to protocol-change detection (matches the digests' trend window),
// and how recent a dose must be for a compound to count as part of the current protocol.
const PROTOCOL_LOOKBACK_DAYS = 120
const CURRENT_PROTOCOL_DAYS = 21

interface ProtocolContextOptions {
  /** What the date is: 'draw' for a lab draw (the default) or 'scan' for a DEXA. Used in the prose. */
  noun?: string
  /**
   * Whether to include where the date landed on each slow-release compound's dosing curve. That
   * explains a blood level (a draw near peak vs near trough), not a body composition, so the DEXA
   * summary turns it off.
   */
  timing?: boolean
}

/**
 * Protocol context lines for an AI summary prompt: per-compound dosing facts and stop/adjust
 * events near the date — so the model can attribute shifts (testosterone -> more erythropoiesis
 * -> ferritin drawdown; HGH plus creatine -> lean mass and water) instead of reading trends in a
 * vacuum. Shared by the labs and DEXA summary endpoints; it grew up inside the labs one.
 *
 * Each active compound gets its own line with its own first-dose date and unambiguous counts.
 * An earlier version passed a bare "(6 dose-days)" recent-window count plus the change
 * detector's CLUSTERED start events (starts within 14 days share the earliest date), and the
 * model fused them into "six dose-days into Testosterone Cypionate started <the HGH date>".
 */
export async function protocolContext(db: D1Database, date: string, opts: ProtocolContextOptions = {}): Promise<string[]> {
  const noun = opts.noun ?? 'draw'
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1)
  const windowStart = shiftDays(date, -PROTOCOL_LOOKBACK_DAYS)
  const { results } = await db.prepare(
    'SELECT date, peptides FROM journal_entries WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC'
  ).bind(windowStart, date).all()
  const journal: TrendJournalRow[] = (results ?? []).map(r => ({
    date: r.date as string,
    weight_lbs: null,
    rhr: null,
    hrv: null,
    bp_systolic: null,
    peptides: JSON.parse((r.peptides as string) || '[]')
  }))
  if (!journal.length) return []

  // Unique dose dates per compound, ascending (rows are already sorted).
  const doseDates = new Map<string, string[]>()
  for (const row of journal) {
    for (const p of row.peptides ?? []) {
      if (!p.compound) continue
      const dates = doseDates.get(p.compound) ?? []
      if (dates.at(-1) !== row.date) dates.push(row.date)
      doseDates.set(p.compound, dates)
    }
  }

  const recentCutoff = shiftDays(date, -CURRENT_PROTOCOL_DAYS)
  const active = [...doseDates.entries()]
    .map(([compound, dates]) => ({ compound, dates, recent: dates.filter(d => d >= recentCutoff).length }))
    .filter(c => c.recent > 0)
    .sort((a, b) => b.recent - a.recent)

  const lines: string[] = []
  if (active.length) {
    lines.push(`Active protocol per compound (counts are dose-DAYS from the journal; "recently" = the ${CURRENT_PROTOCOL_DAYS} days up to this ${noun} — a window count, NOT total exposure):`)
    for (const { compound, dates, recent } of active) {
      const first = dates[0]!
      // Dosing that reaches back to the edge of the queried window started before it —
      // don't present the window edge as a start date.
      const since = first <= shiftDays(windowStart, 1)
        ? `ongoing since before ${windowStart} (edge of available data)`
        : `first logged dose ${first}`
      lines.push(`- ${compound}: dosed ${recent} of the last ${CURRENT_PROTOCOL_DAYS} days, ${dates.length} dose-days in the last ${PROTOCOL_LOOKBACK_DAYS} days; ${since}`)
    }
  }
  else {
    lines.push(`Active protocol: no compounds logged in the 3 weeks up to this ${noun}.`)
  }

  // Where the date landed on each slow-release compound's dosing curve — a draw a day or two
  // after an injection reads near peak on the hormones that ester carries; one right before
  // the next injection reads near trough. Same model as the exposure charts (shared/utils/pk).
  // Doses come back in the model's own unit (pkDosesFor converts mcg and drops anything it
  // can't express), so the amount printed is in that unit too.
  if (opts.timing ?? true) {
    const timing: string[] = []
    for (const [compound, model] of Object.entries(PK_MODELS)) {
      const t = drawTiming(pkDosesFor(journal, compound, model), model, date)
      if (!t) continue
      const amount = `${t.lastDoseAmount} ${model.unit === 'iu' ? 'IU' : 'mg'}`
      timing.push(`- ${compound}: last dose ${amount} on ${t.lastDoseDate}, ${t.daysSinceLastDose} days before the ${noun}; modeled exposure at the ${noun} ≈ ${t.pctOfRecentPeak}% of its recent peak (${t.phase}).`)
    }
    if (timing.length) {
      lines.push(`${Noun} timing vs slow-release injectables (Bateman-modeled from the dose log with typical ester/peptide half-lives — relative shape, NOT measured levels):`)
      lines.push(...timing)
    }
  }

  // Starts are covered precisely per compound above; the change detector adds what those lines
  // can't show — discontinuations and sustained dosing changes. Its start events are clustered
  // (nearby starts share the earliest date), so they are deliberately NOT passed to the prompt.
  const changes = detectProtocolChanges(journal, date).filter(c => c.kind !== 'start')
  if (changes.length) {
    lines.push(`Discontinuations / dosing changes in the ~90 days before this ${noun}: ${changes
      .map(c => c.kind === 'stop'
        ? `${c.compounds.join(' + ')} stopped around ${c.date}`
        : `${c.compounds.join(' + ')} dosing changed ${c.date}`)
      .join('; ')}`)
  }
  return lines
}
