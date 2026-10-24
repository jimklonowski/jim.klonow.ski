// Folding identical doses for a one-glance list: three 75 mg iron tablets on one day read as one
// row — "Iron Bisglycinate ×3 · 3 × 75 mg" with the three times under it — not three rows that
// say the same thing (the home page's PROTOCOL · LOGGED TODAY block). The dose log itself is
// untouched; this is a read-time view.

export interface DoseLike {
  time?: string | null
  compound: string
  dose: number
  unit: string
  site?: string | null
}

export interface DoseGroup<T extends DoseLike> {
  /** The earliest dose of the group — its time and figures lead the row. */
  first: T
  count: number
  /** Every logged time in the group, in log order (doses without a time contribute none). */
  times: string[]
  /** The group's doses added up, in the dose's unit, rounded to two decimals. */
  total: number
}

/**
 * Doses of one compound with the same amount, unit and site fold into one group; anything that
 * differs (a second compound, a different site, a different amount) stays its own row. Groups
 * keep the order of their first dose, so a sorted-by-time list stays in time order.
 */
export function groupDoses<T extends DoseLike>(doses: T[]): DoseGroup<T>[] {
  const groups = new Map<string, DoseGroup<T>>()
  for (const d of doses) {
    const key = [d.compound, d.dose, d.unit, d.site ?? ''].join('\u0000')
    const g = groups.get(key)
    if (g) {
      g.count++
      g.total = Math.round((g.total + d.dose) * 100) / 100
      if (d.time) g.times.push(d.time)
    }
    else {
      groups.set(key, { first: d, count: 1, times: d.time ? [d.time] : [], total: d.dose })
    }
  }
  return [...groups.values()]
}
