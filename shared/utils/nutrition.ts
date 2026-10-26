// Calories and macros for the meal log, estimated ONCE per distinct meal text and cached.
//
// The food columns are four freeform strings a day (breakfast/snack/lunch/dinner). Jim's meals
// repeat heavily — 699 logged meals were 255 distinct strings in Oct 2026, and the top ten
// covered a third of the rows — so an estimate keyed by the normalized text is cheap (one model
// call per NEW string, ever) and consistent (the same meal always reads the same). The key is a
// sorted token set, so "protein + creatine shake", "protein shake + creatine" and "Protein shake
// + Creatine" share one estimate and one autocomplete entry.
//
// Three sources, in order of trust: a hand correction entered in the UI (source 'manual', a row
// in meal_estimates), the code-level MEAL LIBRARY of Jim's regulars with label figures
// (shared/utils/mealLibrary.ts, source 'library'), and a model estimate (source 'ai', also a row)
// that the owner asks for explicitly — never automatically. Label figures are read as figures;
// a model estimate is read as what it is (restaurant portions vary and the text names no
// weights, so expect ±20–30 % per meal) and every surface marks it "est.".
import { sodaKcalTotals } from './soda.ts'
import { shiftDays } from './dates.ts'
// (Not re-exported: shared/utils is auto-imported, and a name exported from two files makes Nuxt
// warn and pick one — import mealKey / splitQuantity from './mealKey.ts' directly.)
import { mealKey, splitQuantity } from './mealKey.ts'
import { LIBRARY_KNOWN, libraryLookup } from './mealLibrary.ts'

/**
 * The slots of a day's food, in day order. Three optional snacks sit in the gaps (a snack
 * between breakfast and lunch is a different thing from one before bed); `snack` is the legacy
 * single slot every row before Oct 2026 used, shown where it always was, never offered for new
 * entries. Keys are JSON keys in journal_entries.food — adding one here adds it to the save
 * schema (shared/utils/schemas.ts) and to every reader.
 */
export const MEAL_SLOTS = ['breakfast', 'snack', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'snack_eve'] as const
export type MealSlot = typeof MEAL_SLOTS[number]

export const MAIN_SLOTS = ['breakfast', 'lunch', 'dinner'] as const
export type MainSlot = typeof MAIN_SLOTS[number]

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  snack: 'Snack',
  snack_am: 'Morning snack',
  lunch: 'Lunch',
  snack_pm: 'Afternoon snack',
  dinner: 'Dinner',
  snack_eve: 'Evening snack'
}

/** The example in each empty slot — Jim's regulars (the hub card and the day page share these). */
export const MEAL_SLOT_PLACEHOLDERS: Record<MealSlot, string> = {
  breakfast: 'Protein shake + creatine',
  snack: 'Sourdough',
  snack_am: 'Beef sticks',
  lunch: 'Chipotle bowl',
  snack_pm: 'Sourdough',
  dinner: 'Steak + veggies',
  snack_eve: 'Watermelon'
}

export function isSnackSlot(slot: MealSlot): boolean {
  return slot === 'snack' || slot === 'snack_am' || slot === 'snack_pm' || slot === 'snack_eve'
}

/** Every slot's ranked autocomplete history (texts only) — see mealHistory. */
export function mealHistoryBySlot(entries: FoodEntry[]): Record<MealSlot, string[]> {
  return Object.fromEntries(MEAL_SLOTS.map(s => [s, mealHistory(entries, s).map(h => h.text)])) as Record<MealSlot, string[]>
}

/**
 * A day whose logged meals ALL have figures — the one rule for counting it in a daily total or
 * an average (a day with one unestimated meal would read low). `DayNutrition.complete` is this
 * plus every soda sized.
 */
export function hasFullFigures(n: DayNutrition): boolean {
  return n.meals.length > 0 && n.missing.length === 0
}

/** Snacks share one history: what was a morning snack once suggests itself for an afternoon one. */
function slotFamily(slot: MealSlot): string {
  return isSnackSlot(slot) ? 'snack' : slot
}

export type EstimateConfidence = 'low' | 'medium' | 'high'
/** 'library' = shared/utils/mealLibrary.ts (code); 'manual' = entered in the UI; 'ai' = a model estimate. */
export type EstimateSource = 'ai' | 'manual' | 'library'

/** One row of meal_estimates: the cached nutrition for one meal key. */
export interface MealEstimate {
  key: string
  /** The spelling that was estimated (first seen) — the key is for lookup, this is for reading. */
  text: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  confidence: EstimateConfidence
  /** The portion the model assumed, one short clause; null when nothing was assumed. */
  assumptions: string | null
  /** 'manual' = entered by hand (never overwritten by a re-estimate); 'library' = code; 'ai' = the model. */
  source: EstimateSource
  model: string | null
  created_at: string
  updated_at: string
  /** Set on a composed figure only ("beef sticks + apple"): the parts it was summed from. Never a row. */
  parts?: MealPart[]
  /** Set on a library figure whose serving is counted in a unit (2 sticks, 4 slices of 8) — see splitCount. */
  portion?: MealPortion
}

/** How a library serving counts in its own unit; `whole` is the unit count of the whole thing (a pizza's 8 slices). */
export interface MealPortion {
  count: number
  unit: string
  whole?: number
}

export type EstimateIndex = Map<string, MealEstimate>

export function indexEstimates(rows: MealEstimate[] | null | undefined): EstimateIndex {
  return new Map((rows ?? []).map(r => [r.key, r]))
}

/** The LABEL figures for exactly this key — a hand entry (the most recent intent), else the code library — or null. */
function labelLookup(index: EstimateIndex, text: string, key: string): MealEstimate | null {
  const row = index.get(key) ?? null
  if (row?.source === 'manual') return row
  return libraryLookup(text)
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * `e` times `n`, re-keyed to the text that asked for it ("2 x <meal>", "1 beef stick"). `label`
 * replaces the "N ×" wording when the scale came from a count in the serving's own unit.
 */
export function scaleEstimate(e: MealEstimate, n: number, text: string, label?: string): MealEstimate {
  const { portion: _portion, ...rest } = e
  return {
    ...rest,
    key: mealKey(text),
    text,
    kcal: Math.round(e.kcal * n),
    protein_g: round1(e.protein_g * n),
    carbs_g: round1(e.carbs_g * n),
    fat_g: round1(e.fat_g * n),
    assumptions: `${label ?? `${n} ×`} ${e.text}${e.assumptions ? ` (${e.assumptions})` : ''}`
  }
}

// --- "1 beef stick", "4 slices costco pizza", "whole costco pizza", "½ costco pizza", "2 kiwi" ---
// A count, fraction or "whole"/"half" before a known meal, read in the meal's own unit when the
// library declares one (shared/utils/mealLibrary.ts `portion`): "1 beef stick" is half the
// two-stick serving, "whole costco pizza" is 8 of the 4-slice serving's slices. A meal with no
// declared portion is simply multiplied ("2 kiwi"). Distinct from "N x", which always multiplies
// the whole serving. The text keeps its count, so the figures stay derivable from text + library.

const COUNT_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const FRACTION_GLYPHS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '¼': 0.25, '¾': 0.75 }
const UNIT_WORDS = /^(slices?|sticks?|pieces?|strips?|cups?|containers?|bowls?|fillets?|filets?|servings?|oz|ounces?)$/i

export interface MealCount {
  /** The number typed; for 'fraction' and 'half' a fraction of the whole, for 'whole' unused. */
  n: number
  kind: 'count' | 'fraction' | 'whole'
  /** The unit word typed after the count, singular and lowercase, if any. */
  unit?: string
  rest: string
}

/** The leading count or fraction of a meal text, or null. "N x" is not a count (splitQuantity). */
export function splitCount(text: string): MealCount | null {
  const m = /^\s*(?:an?\s+)?(\d+(?:\.\d+)?|\d+\s*\/\s*\d+|[½⅓¼¾]|one|two|three|four|five|six|seven|eight|nine|ten|half|whole)\s+(?:(\S+)\s+)?(?:of\s+)?(.*)$/i.exec(text)
  if (!m) return null
  const [, raw, maybeUnit, tail] = m
  const token = raw!.toLowerCase()
  // The unit word is optional: when the word after the count is not one, it is part of the meal.
  const unit = maybeUnit && UNIT_WORDS.test(maybeUnit) ? maybeUnit.toLowerCase().replace(/s$/, '').replace(/^ounce$/, 'oz') : undefined
  const rest = (unit ? tail! : [maybeUnit, tail].filter(Boolean).join(' ')).trim()
  if (!rest) return null
  if (token === 'whole') return { n: 1, kind: 'whole', unit, rest }
  if (token === 'half') return { n: 0.5, kind: 'fraction', unit, rest }
  if (token in FRACTION_GLYPHS) return { n: FRACTION_GLYPHS[token]!, kind: 'fraction', unit, rest }
  if (token in COUNT_WORDS) return { n: COUNT_WORDS[token]!, kind: 'count', unit, rest }
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(token)
  if (frac) {
    const n = Number(frac[1]) / Number(frac[2])
    return Number.isFinite(n) && n > 0 && n < 1 ? { n, kind: 'fraction', unit, rest } : null
  }
  const n = Number(token)
  return n > 0 && n <= 50 ? { n, kind: 'count', unit, rest } : null
}

/** The figures for "<count> <meal>", or null when the rest is unknown or the unit doesn't fit. */
function countedEstimate(index: EstimateIndex, text: string): MealEstimate | null {
  const c = splitCount(text)
  if (!c) return null
  const base = lookupEstimate(index, c.rest)
  if (!base) return null
  const p = base.portion
  const unitName = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (c.kind === 'whole') {
    if (!p?.whole) return scaleEstimate(base, 1, text, 'the whole')
    return scaleEstimate(base, p.whole / p.count, text, `${unitName(p.whole, p.unit)} (whole) of`)
  }
  if (c.kind === 'fraction') {
    if (!p?.whole) return scaleEstimate(base, c.n, text, `${Math.round(c.n * 100) / 100} ×`)
    const units = c.n * p.whole
    return scaleEstimate(base, units / p.count, text, `${Math.round(units * 10) / 10} of ${p.whole} ${p.unit}s of`)
  }
  // A typed unit must be the serving's own; "3 cups watermelon" against a stick-counted meal is unknown.
  if (c.unit && (!p || c.unit !== p.unit)) return null
  if (!p) return scaleEstimate(base, c.n, text)
  return scaleEstimate(base, c.n / p.count, text, `${unitName(c.n, p.unit)} (a serving is ${p.count}) of`)
}

/**
 * The figures for a meal text, or null. Trust in the SOURCE comes first, the path second: label
 * figures — a hand entry (the most recent intent), then the code library — beat a model estimate
 * whether they answer the text itself or, for "N x <meal>", the meal it multiplies (two sandwiches
 * AND two guac cups, per Jim's convention). Only when no label source knows the meal at either
 * level does a model row answer, again the exact text before the multiplied one. So a regular
 * joining the library takes over every quantity of itself even where an older model guess for
 * the "2 x" text is still cached (audit #42 item 8).
 */
export function lookupEstimate(index: EstimateIndex, text: string | null | undefined): MealEstimate | null {
  const key = mealKey(text)
  if (!key) return null
  const trimmed = text!.trim()
  const qty = splitQuantity(trimmed)
  const base = qty ? { text: qty.rest, key: mealKey(qty.rest) } : null

  const label = labelLookup(index, trimmed, key)
  if (label) return label
  if (base) {
    const labelBase = labelLookup(index, base.text, base.key)
    if (labelBase) return scaleEstimate(labelBase, qty!.n, trimmed)
  }
  const row = index.get(key)
  if (row) return row
  if (base) {
    const rowBase = index.get(base.key)
    if (rowBase) return scaleEstimate(rowBase, qty!.n, trimmed)
  }
  // Then a count in the meal's own unit ("1 beef stick", "whole costco pizza", "2 kiwi").
  // Last: a joined text is the sum of its parts when every part is known on its own ("beef
  // sticks, apple" in one snack slot — two snacks, one slot, no second slot needed). After the
  // whole-text paths, so a combo the library or a hand entry prices as one meal ("grilled cheese
  // + guac") keeps those figures. With a leading "N x" the WHOLE is composed and then multiplied
  // — composing the text as typed would hand the "2 x" to the first part alone.
  if (base) {
    const compositeBase = countedEstimate(index, base.text) ?? composeEstimate(index, base.text)
    return compositeBase ? scaleEstimate(compositeBase, qty!.n, trimmed) : null
  }
  return countedEstimate(index, trimmed) ?? composeEstimate(index, trimmed)
}

/**
 * The parts of a joined meal text — "beef sticks + apple" or "beef sticks, apple, 2 kiwi" →
 * ['beef sticks', 'apple', '2 kiwi'] — or null when it is one meal. Only " + " with space on both
 * sides and a comma split: "and" and a bare "+" inside a word do not, so a single-meal text
 * reads as it always did (and a whole-text figure is looked up before any split).
 */
export function splitParts(text: string | null | undefined): string[] | null {
  const parts = (text ?? '').split(/\s+\+\s+|\s*,\s*/).map(p => p.trim()).filter(Boolean)
  return parts.length >= 2 ? parts : null
}

export interface MealPart {
  text: string
  /** The part's own figures (every source, "N x" included), or null when nothing knows it. */
  estimate: MealEstimate | null
}

/**
 * Each part of a plus-joined text with its own lookup, or null for a single meal. The chip
 * reads this to show which parts are known and to send ONLY the unknown ones for an estimate.
 */
export function mealParts(index: EstimateIndex, text: string | null | undefined): MealPart[] | null {
  const parts = splitParts(text)
  if (!parts) return null
  return parts.map(p => ({ text: p, estimate: lookupEstimate(index, p) }))
}

const CONFIDENCE_RANK: Record<EstimateConfidence, number> = { low: 0, medium: 1, high: 2 }

/** The summed figures of a plus-joined text, or null when it is one meal or any part is unknown. */
function composeEstimate(index: EstimateIndex, text: string): MealEstimate | null {
  const parts = mealParts(index, text)
  if (!parts || parts.some(p => !p.estimate)) return null
  const estimates = parts.map(p => p.estimate!)
  const totals = estimates.reduce(
    (t, e) => ({ kcal: t.kcal + e.kcal, protein_g: t.protein_g + e.protein_g, carbs_g: t.carbs_g + e.carbs_g, fat_g: t.fat_g + e.fat_g }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
  // One model part makes the sum a model figure (it reads "≈ … est."); otherwise the weaker of
  // the label sources, so a hand-entered part never dresses the whole as library figures.
  const source: EstimateSource = estimates.some(e => e.source === 'ai') ? 'ai' : estimates.some(e => e.source === 'manual') ? 'manual' : 'library'
  const confidence = estimates.reduce<EstimateConfidence>((c, e) => (CONFIDENCE_RANK[e.confidence] < CONFIDENCE_RANK[c] ? e.confidence : c), 'high')
  const latest = (pick: (e: MealEstimate) => string) => estimates.map(pick).sort().at(-1)!
  return {
    key: mealKey(text),
    text,
    kcal: Math.round(totals.kcal),
    protein_g: round1(totals.protein_g),
    carbs_g: round1(totals.carbs_g),
    fat_g: round1(totals.fat_g),
    confidence,
    assumptions: estimates.map(e => `${e.text} ${fmtKcal(e.kcal)}`).join(' + '),
    source,
    model: estimates.find(e => e.model)?.model ?? null,
    created_at: latest(e => e.created_at),
    updated_at: latest(e => e.updated_at),
    parts
  }
}

/** Label figures (library or hand-entered) read as numbers; a model estimate reads as "≈ … est.". */
export function isLabelFigure(e: MealEstimate): boolean {
  return e.source !== 'ai'
}

export interface MacroTotals {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface DayMeal {
  slot: MealSlot
  text: string
  estimate: MealEstimate | null
}

export interface DayNutrition extends MacroTotals {
  meals: DayMeal[]
  /** Meals that had an estimate. */
  estimated: number
  /** Meal texts with no estimate yet — the day's total is a floor while this is non-empty. */
  missing: string[]
  /** Calories from sodas whose size carried a volume (shared/utils/soda.ts); counted in `kcal`. */
  sodaKcal: number
  sodaUnsized: number
  /** Every logged meal estimated and no unsized soda: the total is as good as it gets. */
  complete: boolean
}

type DayLike = {
  food?: Partial<Record<MealSlot, string | null | undefined>> | null
  sodas?: Array<{ drink?: string | null, size?: string | null }> | null
}

/** A day's logged meals with their estimates, summed, soda calories included. */
export function dayNutrition(entry: DayLike | null | undefined, index: EstimateIndex): DayNutrition {
  const meals: DayMeal[] = []
  for (const slot of MEAL_SLOTS) {
    const text = entry?.food?.[slot]?.trim()
    if (text) meals.push({ slot, text, estimate: lookupEstimate(index, text) })
  }
  const totals: MacroTotals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  const missing: string[] = []
  for (const m of meals) {
    if (!m.estimate) {
      missing.push(m.text)
      continue
    }
    totals.kcal += m.estimate.kcal
    totals.protein_g += m.estimate.protein_g
    totals.carbs_g += m.estimate.carbs_g
    totals.fat_g += m.estimate.fat_g
  }
  const soda = sodaKcalTotals(entry?.sodas ?? [])
  totals.kcal += soda.kcal
  // Soda is sugar: ~26 g carbs per 100 kcal, nothing else.
  totals.carbs_g += Math.round(soda.kcal * 0.26)
  const estimated = meals.length - missing.length
  return {
    ...totals,
    meals,
    estimated,
    missing,
    sodaKcal: soda.kcal,
    sodaUnsized: soda.unsized,
    complete: meals.length > 0 && missing.length === 0 && soda.unsized === 0
  }
}

/** "1,850" — whole kilocalories with a thousands separator. */
export function fmtKcal(kcal: number): string {
  return Math.round(kcal).toLocaleString('en-US')
}

/** "95P 180C 70F" — whole grams, the compact macro line the chips and headers use. */
export function fmtMacros(t: MacroTotals): string {
  return `${Math.round(t.protein_g)}P ${Math.round(t.carbs_g)}C ${Math.round(t.fat_g)}F`
}

/** "≈ 540 kcal · 28P 45C 26F" — one estimate as a chip. */
export function fmtEstimate(e: MealEstimate): string {
  return `≈ ${fmtKcal(e.kcal)} kcal · ${fmtMacros(e)}`
}

/** True when any of the day's figures came from the model — the total then reads "≈ … est.". */
export function nutritionIsEstimated(n: DayNutrition): boolean {
  return n.meals.some(m => m.estimate?.source === 'ai')
}

/**
 * The meal a plate logged right now most likely is: breakfast before 10:30, lunch to 15:00,
 * dinner after. Drives which "+ add" the hub highlights; snacks are always explicit.
 */
export function slotForTime(hhmm: string): MainSlot {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  const minutes = m ? Number(m[1]) * 60 + Number(m[2]) : 12 * 60
  if (minutes < 10 * 60 + 30) return 'breakfast'
  if (minutes < 15 * 60) return 'lunch'
  return 'dinner'
}

export interface MealHistoryItem {
  key: string
  /** The most-used spelling for this key. */
  text: string
  /** Times logged in any slot. */
  count: number
  /** Times logged in the slot asked about (0 when no slot was given). */
  slotCount: number
}

type FoodEntry = { food?: Partial<Record<MealSlot, string | null | undefined>> | null }

/**
 * Every distinct meal across the log, one canonical spelling per key (the most frequent, ties
 * by first seen), ranked for autocomplete: this slot's own history first, then overall
 * frequency, then alphabetically. Without a slot the ranking is overall frequency.
 */
export function mealHistory(entries: FoodEntry[], slot?: MealSlot): MealHistoryItem[] {
  const byKey = new Map<string, { spellings: Map<string, number>, count: number, slotCount: number }>()
  for (const e of entries) {
    for (const s of MEAL_SLOTS) {
      const raw = e.food?.[s]?.trim()
      if (!raw) continue
      const key = mealKey(raw)
      if (!key) continue
      const cur = byKey.get(key) ?? { spellings: new Map<string, number>(), count: 0, slotCount: 0 }
      cur.spellings.set(raw, (cur.spellings.get(raw) ?? 0) + 1)
      cur.count++
      if (slot && slotFamily(s) === slotFamily(slot)) cur.slotCount++
      byKey.set(key, cur)
    }
  }
  return [...byKey.entries()]
    .map(([key, v]) => {
      let text = ''
      let best = -1
      for (const [spelling, n] of v.spellings) {
        if (n > best) {
          best = n
          text = spelling
        }
      }
      return { key, text, count: v.count, slotCount: v.slotCount }
    })
    .sort((a, b) => b.slotCount - a.slotCount || b.count - a.count || a.text.localeCompare(b.text))
}

/**
 * The canonical spellings of every meal in the log with no figures from any source — what's
 * left to enter or estimate. A plus-joined text contributes its unknown PARTS, not itself: the
 * model is asked about "mystery bar", never about "beef sticks + mystery bar" when beef sticks
 * are already priced, and the answer then serves every combo the part appears in.
 */
export function unestimatedMeals(entries: FoodEntry[], index: EstimateIndex): string[] {
  const out = new Map<string, string>()
  for (const h of mealHistory(entries)) {
    if (lookupEstimate(index, h.text)) continue
    const parts = mealParts(index, h.text)
    for (const text of parts ? parts.filter(p => !p.estimate).map(p => p.text) : [h.text]) {
      const key = mealKey(text)
      if (key && !out.has(key)) out.set(key, text)
    }
  }
  return [...out.values()]
}

// --- "did you mean …?" ---
// A meal typed slightly differently from one that already has figures should land on that one,
// not become a new string with no figures. Same key (spelling, order, case, plurals) is a sure
// match; close wording is scored on the key tokens and either paired on its own (strong) or
// offered as a question (maybe). Quantities are split off first, so "2 x costco pizza" is
// matched on "costco pizza" and offered back as "2 x <canonical>".

export interface KnownMeal {
  text: string
  key: string
  /** Times logged (0 for a library or cache entry never logged under this spelling). */
  count: number
}

/** Every meal a typed text can be matched against: each logged spelling with figures, the library's texts, and the cache's. */
export function knownMeals(entries: FoodEntry[], index: EstimateIndex): KnownMeal[] {
  const out = new Map<string, KnownMeal>()
  for (const h of mealHistory(entries)) {
    if (!lookupEstimate(index, h.text)) continue
    // A meal logged as "2 x <meal>" is known as the MEAL: suggestMeal strips the typed quantity
    // and puts it back on the match, so a quantity-bearing candidate would answer "3 x <meal>"
    // with "3 x 2 x <meal>" (audit #42 item 43). The history is ranked by count, so the first
    // spelling seen for a key is its most common one; later loggings add to the count.
    const qty = splitQuantity(h.text)
    const text = qty ? qty.rest : h.text
    const key = qty ? mealKey(text) : h.key
    if (!key) continue
    const cur = out.get(key)
    out.set(key, cur ? { ...cur, count: cur.count + h.count } : { text, key, count: h.count })
  }
  for (const { text, key } of LIBRARY_KNOWN) {
    if (!out.has(key)) out.set(key, { text, key, count: 0 })
  }
  // Cached rows for a "2 x <meal>" text are candidates as the meal too, for the same reason.
  for (const row of index.values()) {
    const qty = splitQuantity(row.text)
    const text = qty ? qty.rest : row.text
    const key = qty ? mealKey(text) : row.key
    if (key && !out.has(key)) out.set(key, { text, key, count: 0 })
  }
  return [...out.values()]
}

export interface MealSuggestion {
  /** The known meal's spelling, with the typed quantity put back ("2 x costco cheese pizza"). */
  text: string
  /** exact = same key, different spelling; strong = pair on its own; maybe = ask first. */
  strength: 'exact' | 'strong' | 'maybe'
  score: number
}

/** True when one token is a 3+ letter prefix of the other ("mcd" → "mcdonald"). */
function isPrefixPair(a: string, b: string): boolean {
  return (a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b))
}

/**
 * Jaccard over key tokens, each token used once. An exact token is a full hit; a prefix pair is
 * HALF a hit and is counted separately — "chips" folds to "chip", which is a prefix of
 * "chipotle", and at full weight "chicken quesadilla + chips" scored 1.0 against the library's
 * "chipotle chicken quesadilla" and was silently saved as it (audit #42 item 2). An exact
 * partner is always preferred over a prefix one.
 */
function similarity(a: string[], b: string[]): { score: number, prefixHits: number } {
  if (!a.length || !b.length) return { score: 0, prefixHits: 0 }
  const used = new Set<number>()
  let hits = 0
  let prefixHits = 0
  for (const t of a) {
    let j = b.findIndex((u, i) => !used.has(i) && u === t)
    let weight = 1
    if (j < 0) {
      j = b.findIndex((u, i) => !used.has(i) && isPrefixPair(t, u))
      weight = 0.5
    }
    if (j >= 0) {
      used.add(j)
      hits += weight
      if (weight < 1) prefixHits++
    }
  }
  return { score: hits / (a.length + b.length - hits), prefixHits }
}

// 0.85: one small word on a seven-word meal pairs on its own (7/8); a missing ingredient on a
// five-word bowl (4/5 = 0.8) is a question — "chicken bowl" is not "chicken + broccoli bowl".
// A match that leaned on ANY prefix pair is never strong: abbreviations get offered, not applied.
const STRONG_MATCH = 0.85
const MAYBE_MATCH = 0.5

/**
 * The known meal a typed text most likely means, or null when it is already one (same spelling)
 * or nothing comes close. Ties go to the meal logged more often.
 */
export function suggestMeal(text: string | null | undefined, known: KnownMeal[]): MealSuggestion | null {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return null
  const qty = splitQuantity(trimmed)
  const core = qty ? qty.rest : trimmed
  const key = mealKey(core)
  if (!key) return null
  const withQty = (t: string) => (qty ? `${qty.n} x ${t}` : t)

  const exact = known.find(k => k.key === key)
  if (exact) return exact.text === core ? null : { text: withQty(exact.text), strength: 'exact', score: 1 }

  const tokens = key.split(' ')
  let best: { meal: KnownMeal, score: number, prefixHits: number } | null = null
  for (const meal of known) {
    const { score, prefixHits } = similarity(tokens, meal.key.split(' '))
    if (!best || score > best.score || (score === best.score && meal.count > best.meal.count)) best = { meal, score, prefixHits }
  }
  if (!best || best.score < MAYBE_MATCH) return null
  const strong = best.score >= STRONG_MATCH && best.prefixHits === 0
  return { text: withQty(best.meal.text), strength: strong ? 'strong' : 'maybe', score: best.score }
}

/**
 * What a typed meal is saved as: a sure or strong match's spelling, otherwise the text itself.
 * `changed` tells the caller to say so (a toast) — the pairing is silent, never invisible.
 */
export function resolveMealText(text: string, known: KnownMeal[]): { text: string, changed: boolean } {
  const trimmed = text.trim()
  const s = suggestMeal(trimmed, known)
  if (s && s.strength !== 'maybe') return { text: s.text, changed: s.text !== trimmed }
  return { text: trimmed, changed: false }
}

export interface NutritionAverage {
  /** Days in the window with every logged meal estimated (partial days would read low). */
  days: number
  kcal: number
  protein_g: number
  /** True when any counted day leans on a model estimate — label figures alone are not "est." */
  estimated: boolean
}

/**
 * Today's log is finished once dinner is in: until then the day is a running total, not a daily
 * figure, and an average or a "latest" tile that read it would take half a day for a whole one.
 * Past days are done by definition (audit #42 item 7).
 */
export function isDayDone(entry: (DayLike & { date: string }) | null | undefined, today: string): boolean {
  if (!entry) return false
  return entry.date < today || !!entry.food?.dinner?.trim()
}

/**
 * The trailing `days`-day window for a daily average: it ends today once today's log is done
 * (dinner logged), otherwise yesterday — so a half-logged today never counts as a whole day.
 */
export function nutritionWindow(
  entries: Array<DayLike & { date: string }>,
  today: string,
  days = 7
): { from: string, to: string } {
  const todayEntry = entries.find(e => e.date === today)
  const to = isDayDone(todayEntry, today) ? today : shiftDays(today, -1)
  return { from: shiftDays(to, -(days - 1)), to }
}

/**
 * Mean daily kcal and protein over the trailing `days` days (see `nutritionWindow`), counting
 * only days whose meals are all estimated — a day with one unestimated meal would drag the
 * average down.
 */
export function nutritionAverage(
  entries: Array<DayLike & { date: string }>,
  index: EstimateIndex,
  today: string,
  windowDays = 7
): NutritionAverage {
  const { from, to } = nutritionWindow(entries, today, windowDays)
  let days = 0
  let kcal = 0
  let protein = 0
  let estimated = false
  for (const e of entries) {
    if (e.date < from || e.date > to) continue
    const n = dayNutrition(e, index)
    if (!hasFullFigures(n)) continue
    days++
    kcal += n.kcal
    protein += n.protein_g
    if (nutritionIsEstimated(n)) estimated = true
  }
  return days
    ? { days, kcal: Math.round(kcal / days), protein_g: Math.round(protein / days), estimated }
    : { days: 0, kcal: 0, protein_g: 0, estimated: false }
}
