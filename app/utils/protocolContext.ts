import type { JournalEntry } from '~/data/journal'

export interface CompoundContext {
  compound: string
  /** Distinct days this compound was dosed within the lookback window. */
  doseDays: number
  /** Sum of doses in the window, in `unit`. */
  totalDose: number
  /** Display unit (the most frequent unit logged for this compound in the window). */
  unit: string
  /** Average dose per dosing day, in `unit`. */
  avgDose: number
  /** Most recent dose date at/before the draw. */
  lastDoseDate: string
  /** Earliest dose date within the window. */
  firstDoseDate: string
  /** Days between the last dose and the draw (0 = dosed on the draw day). */
  daysBeforeDraw: number
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000
  )
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Compounds with at least one logged dose in the `windowDays` leading up to (and including)
// a lab draw — i.e. the protocol that was running when the blood was drawn. Sorted by most
// recently dosed first.
export function activeCompoundsAt(
  entries: JournalEntry[],
  drawDate: string,
  windowDays = 21
): CompoundContext[] {
  const windowStart = addDays(drawDate, -windowDays)

  const byCompound = new Map<string, { date: string, dose: number, unit: string }[]>()
  for (const e of entries) {
    if (e.date < windowStart || e.date > drawDate) continue
    for (const p of e.peptides ?? []) {
      if (!p.compound) continue
      const list = byCompound.get(p.compound) ?? []
      list.push({ date: e.date, dose: p.dose, unit: p.unit })
      byCompound.set(p.compound, list)
    }
  }

  const result: CompoundContext[] = []
  for (const [compound, doses] of byCompound) {
    // Pick the most frequently logged unit as the display unit, then aggregate matching doses.
    const unitCounts = new Map<string, number>()
    for (const d of doses) unitCounts.set(d.unit, (unitCounts.get(d.unit) ?? 0) + 1)
    const unit = [...unitCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0]

    const matching = doses.filter(d => d.unit === unit)
    const totalDose = matching.reduce((s, d) => s + d.dose, 0)
    const dates = [...new Set(doses.map(d => d.date))].sort()
    const lastDoseDate = dates[dates.length - 1]!
    const firstDoseDate = dates[0]!

    result.push({
      compound,
      doseDays: dates.length,
      totalDose,
      unit,
      avgDose: matching.length ? totalDose / matching.length : 0,
      lastDoseDate,
      firstDoseDate,
      daysBeforeDraw: daysBetween(lastDoseDate, drawDate)
    })
  }

  return result.sort((a, b) => a.daysBeforeDraw - b.daysBeforeDraw || b.doseDays - a.doseDays)
}

export function roundDose(n: number): number {
  return Math.round(n * 100) / 100
}
