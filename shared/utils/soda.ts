// Soda volumes. Sizes are stored as freeform labels (SODA_SIZES in app/data/journal.ts) that
// carry their volume in the name — "7.5oz mini can", "12oz can", "20oz bottle" — so ounces are
// parsed out of the label rather than kept as a second field. Fountain sizes carry no number;
// the figures below are typical US fast-food pours and are approximate by nature.
//
// Ounces, not count, is the number that reflects the goal: two mini cans are 15 oz and read as
// "two sodas", one 20 oz bottle reads as "one" — the count gets the ranking backwards.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { drinkFigures, sodasOnly } from './drinks.ts'

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

// --- calories ---
// The label figures live in the drink catalogue (shared/utils/drinks.ts) since the list holds
// any drink, not only sodas; these two keep their names for the callers that sum a day's drink
// calories into its nutrition total (shared/utils/nutrition.ts).

/** Calories for one logged drink, or null when its size carries no volume. */
export function sodaKcal(drink: string | null | undefined, size: string | null | undefined): number | null {
  return drinkFigures(drink, size)?.kcal ?? null
}

/** The most recently logged SODA across the journal, with its day — what the soda quick-add repeats (audit #42 item 41: the hub widget and the home button each found it). A sports drink or a coffee logged since is not it: the + SODA button stays the usual soda. */
export function lastSoda<T extends { time: string, drink?: string | null, size?: string | null }>(
  entries: Array<{ date: string, sodas?: T[] | null }>
): (T & { date: string }) | null {
  const all = entries.flatMap(e => sodasOnly(e.sodas).map(s => ({ ...s, date: e.date })))
  all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  return all.at(-1) ?? null
}

/** "DR PEPPER 12oz can" — the quick-add's own label for the drink it will log; "SODA" with no history. */
export function quickAddLabel(last: { drink?: string | null, size?: string | null } | null | undefined): string {
  const drink = (last?.drink || 'Soda').toUpperCase()
  return last?.size ? `${drink} ${last.size}` : drink
}

export function sodaKcalTotals(sodas: Array<{ drink?: string | null, size?: string | null }>): { kcal: number, unsized: number } {
  let kcal = 0
  let unsized = 0
  for (const s of sodas) {
    const k = sodaKcal(s.drink, s.size)
    if (k == null) unsized++
    else kcal += k
  }
  return { kcal, unsized }
}
