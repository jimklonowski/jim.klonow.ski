import type { SignalHealthRow, SignalJournalRow } from '#shared/utils/cycleSignals'
import { activeSignals, protocolChangeWatch, signalShorthand } from '#shared/utils/cycleSignals'
import { shiftDays } from '#shared/utils/dates'
import type { ProtocolRule } from '#shared/utils/protocolRules'

// The passive vitals watch since the latest core protocol change (audit #43 item 67), as one
// prompt line — the cycle watch's model anchored on the change, so between cycles the digests
// and the ask chat still get a deterministic "since hCG 250 IU: SBP −6" instead of inferring
// one from the raw log. Pronoun-free. '' without a dated change, or when nothing has enough
// data on both sides of it yet.

const BASELINE_DAYS = 28

export async function protocolChangeContext(db: D1Database, asOf: string, rules: readonly ProtocolRule[]): Promise<string> {
  const probe = protocolChangeWatch(rules, asOf, [], [])
  if (!probe) return ''
  const from = shiftDays(probe.change.from, -BASELINE_DAYS)
  let journal: SignalJournalRow[]
  let health: SignalHealthRow[]
  try {
    const [jRes, hRes] = await Promise.all([
      db.prepare('SELECT date, weight_lbs, bp_systolic, rhr, hrv FROM journal_entries WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC').bind(from, asOf).all(),
      db.prepare('SELECT date, recovery_score, sleep_total_min FROM health_metrics WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC').bind(from, asOf).all()
    ])
    journal = (jRes.results ?? []) as unknown as SignalJournalRow[]
    health = (hRes.results ?? []) as unknown as SignalHealthRow[]
  }
  catch {
    return ''
  }
  const watch = protocolChangeWatch(rules, asOf, journal, health)
  if (!watch) return ''
  const measured = watch.signals.filter(s => s.state === 'steady' || s.state === 'watch' || s.state === 'flagged')
  if (!measured.length) return ''
  const act = activeSignals(watch.signals)
  const moved = act.map((s) => {
    const rate = s.key === 'weight' && s.ratePerWeek != null && Math.abs(s.ratePerWeek) >= 1 ? ` at ${s.ratePerWeek > 0 ? '+' : ''}${s.ratePerWeek} lbs/wk` : ''
    return `${s.state === 'flagged' ? 'FLAGGED' : 'watch'}: ${signalShorthand(s)}${rate}${s.adverse ? '' : ' (the good direction)'}`
  })
  const steady = measured.filter(s => s.state === 'steady').map(s => s.label)
  const parts = [...moved, steady.length ? `steady: ${steady.join(', ')}` : '']
  return `PROTOCOL CHANGE WATCH — since ${watch.change.text} (${watch.change.from}, ${watch.days} days ago): ${parts.filter(Boolean).join('; ')}. Last 2 weeks against the 4 weeks before the change, noise-thresholded, from the logged vitals and the strap; attribute a move to the change only where the timing fits, and name the change when it does.`
}
