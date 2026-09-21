// Soda volumes. Sizes are stored as freeform labels (SODA_SIZES in app/data/journal.ts) that
// carry their volume in the name — "7.5oz mini can", "12oz can", "20oz bottle" — so ounces are
// parsed out of the label rather than kept as a second field. Fountain sizes carry no number;
// the figures below are typical US fast-food pours and are approximate by nature.
//
// Ounces, not count, is the number that reflects the goal: two mini cans are 15 oz and read as
// "two sodas", one 20 oz bottle reads as "one" — the count gets the ranking backwards.

const FOUNTAIN_OZ: Record<string, number> = {
  small: 16,
  medium: 21,
  large: 32
}

/** Fluid ounces for a stored size label, or null when the label carries no volume. */
export function sodaOunces(size: string | null | undefined): number | null {
  if (!size) return null
  const m = /(\d+(?:\.\d+)?)\s*oz/i.exec(size)
  if (m) return Number(m[1])
  const f = /fountain\s*-?\s*(small|medium|large)/i.exec(size)
  if (f) return FOUNTAIN_OZ[f[1]!.toLowerCase()] ?? null
  return null
}

export interface SodaTotals {
  count: number
  /** Ounces summed over the entries whose size carried a volume. */
  oz: number
  /** Entries with no parseable size — surfaced so the total reads as a floor, not an exact. */
  unsized: number
}

export function sodaTotals(sodas: Array<{ size?: string | null }>): SodaTotals {
  let oz = 0
  let unsized = 0
  for (const s of sodas) {
    const v = sodaOunces(s.size)
    if (v == null) unsized++
    else oz += v
  }
  return { count: sodas.length, oz: Math.round(oz * 10) / 10, unsized }
}

/** "~15 oz" / "~168 oz (+2 unsized)" — '' when nothing carried a size. */
export function fmtSodaOz(t: SodaTotals): string {
  if (!t.count || t.oz === 0) return ''
  return `~${t.oz} oz${t.unsized ? ` (+${t.unsized} unsized)` : ''}`
}
