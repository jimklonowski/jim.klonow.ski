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

export function isSnackSlot(slot: MealSlot): boolean {
  return slot === 'snack' || slot === 'snack_am' || slot === 'snack_pm' || slot === 'snack_eve'
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

/** `e` times `n`, re-keyed to the "N x" text that asked for it. */
export function scaleEstimate(e: MealEstimate, n: number, text: string): MealEstimate {
  return {
    ...e,
    key: mealKey(text),
    text,
    kcal: Math.round(e.kcal * n),
    protein_g: round1(e.protein_g * n),
    carbs_g: round1(e.carbs_g * n),
    fat_g: round1(e.fat_g * n),
    assumptions: `${n} × ${e.text}${e.assumptions ? ` (${e.assumptions})` : ''}`
  }
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
  return null
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

/** The canonical spellings of every meal in the log with no figures from any source — what's left to enter or estimate. */
export function unestimatedMeals(entries: FoodEntry[], index: EstimateIndex): string[] {
  return mealHistory(entries).filter(h => !lookupEstimate(index, h.text)).map(h => h.text)
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
    if (lookupEstimate(index, h.text)) out.set(h.key, { text: h.text, key: h.key, count: h.count })
  }
  for (const { text, key } of LIBRARY_KNOWN) {
    if (!out.has(key)) out.set(key, { text, key, count: 0 })
  }
  for (const row of index.values()) {
    if (!out.has(row.key)) out.set(row.key, { text: row.text, key: row.key, count: 0 })
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
  for (const e of entries) {
    if (e.date < from || e.date > to) continue
    const n = dayNutrition(e, index)
    if (!n.meals.length || n.missing.length) continue
    days++
    kcal += n.kcal
    protein += n.protein_g
  }
  return days
    ? { days, kcal: Math.round(kcal / days), protein_g: Math.round(protein / days) }
    : { days: 0, kcal: 0, protein_g: 0 }
}
