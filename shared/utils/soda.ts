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

// --- calories ---
// Label figures per 12 oz for the SODA_DRINKS suggestions (app/data/journal.ts), lowercased.
// Freeform drinks fall back: anything reading diet / zero / sugar-free is 0, the rest a regular
// soda's ~150. Soda calories feed the day's nutrition total (shared/utils/nutrition.ts).
const KCAL_PER_12OZ: Record<string, number> = {
  'dr pepper': 150,
  'coke': 140,
  'cherry coke': 150,
  'diet coke': 0,
  'coke zero': 0,
  'wild cherry pepsi': 160,
  'sprite': 140,
  'mountain dew': 170,
  'root beer': 160,
  'mr pibb': 140,
  'orange fanta': 160,
  'orange crush': 160,
  'canada dry': 140,
  'ginger ale': 140
}
const DEFAULT_KCAL_PER_12OZ = 150

/** Calories for one logged soda, or null when its size carries no volume. */
export function sodaKcal(drink: string | null | undefined, size: string | null | undefined): number | null {
  const oz = sodaOunces(size)
  if (oz == null) return null
  const name = (drink ?? '').trim().toLowerCase()
  const per12 = KCAL_PER_12OZ[name] ?? (/\b(diet|zero|sugar.?free)\b/.test(name) ? 0 : DEFAULT_KCAL_PER_12OZ)
  return Math.round((oz / 12) * per12)
}

/** Calories summed over the sized sodas, plus how many carried no size (and so no figure). */
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
