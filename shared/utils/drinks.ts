// The drink catalogue (audit #43 items 70 + 71, and the Gatorade gap): one table for everything
// logged in the drink list — the `sodas` array of a journal day, which holds any drink, named
// freehand. A logged entry is still just {time, drink, size}; what it is and what is in it are
// read from its name here, so nothing stored changed shape:
//   - kind: only a 'soda' counts on the SODA meter and in every "N sodas" figure; a sports drink
//     does not, and its ounces count toward the water goal (Jim's call, 2026-11-11);
//   - label figures per 12 fl oz: calories, caffeine, sodium, sugar — the day's nutrition total,
//     the caffeine line (item 70) and the sodium total (item 71) all read these.
// A name the table doesn't know is guessed by kind from its words, then given that kind's
// typical figures; an unrecognized name is a regular soda, which is what the log held before.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { sodaOunces } from './soda.ts'

export type DrinkKind = 'soda' | 'sports' | 'energy' | 'coffee' | 'tea' | 'other'

export interface DrinkInfo {
  kind: DrinkKind
  /** Per 12 fl oz, from the label. */
  kcal: number
  caffeine_mg: number
  sodium_mg: number
  sugar_g: number
}

const d = (kind: DrinkKind, kcal: number, caffeine_mg: number, sodium_mg: number, sugar_g: number): DrinkInfo => ({ kind, kcal, caffeine_mg, sodium_mg, sugar_g })

/** Lowercased name → label figures per 12 fl oz. */
const DRINKS: Record<string, DrinkInfo> = {
  // sodas
  'dr pepper': d('soda', 150, 41, 55, 40),
  'dr pepper cherry': d('soda', 160, 39, 55, 42),
  'coke': d('soda', 140, 34, 45, 39),
  'cherry coke': d('soda', 150, 34, 35, 42),
  'diet coke': d('soda', 0, 46, 40, 0),
  'coke zero': d('soda', 0, 34, 40, 0),
  'wild cherry pepsi': d('soda', 160, 38, 30, 42),
  'sprite': d('soda', 140, 0, 65, 38),
  '7 up': d('soda', 140, 0, 45, 38),
  // From the can's label (Jim's photo, 2026-11-11): 140 kcal, 40 mg sodium, 38 g sugar, caffeine free.
  '7 up shirley temple': d('soda', 140, 0, 40, 38),
  'mountain dew': d('soda', 170, 54, 60, 46),
  'root beer': d('soda', 160, 0, 70, 45),
  'mr pibb': d('soda', 140, 40, 40, 39),
  'orange fanta': d('soda', 160, 0, 60, 44),
  'orange crush': d('soda', 160, 0, 70, 43),
  'canada dry': d('soda', 140, 0, 50, 36),
  'canada dry fruit splash': d('soda', 140, 0, 50, 36),
  'ginger ale': d('soda', 140, 0, 50, 36),
  // sports and electrolyte drinks: mostly water, so their ounces count toward the water goal
  'gatorade': d('sports', 80, 0, 160, 21),
  'gatorade zero': d('sports', 0, 0, 160, 0),
  'powerade': d('sports', 80, 0, 150, 21),
  'powerade zero': d('sports', 0, 0, 150, 0),
  'body armor': d('sports', 90, 0, 30, 21),
  'body armor lyte': d('sports', 15, 0, 30, 2),
  'propel': d('sports', 0, 0, 160, 0),
  'pedialyte': d('sports', 35, 0, 370, 9),
  // energy drinks
  'red bull': d('energy', 160, 114, 150, 39),
  'monster': d('energy', 160, 120, 280, 41),
  'celsius': d('energy', 10, 200, 0, 0),
  // coffee and tea
  'coffee': d('coffee', 5, 140, 5, 0),
  'cold brew': d('coffee', 5, 150, 10, 0),
  'iced tea': d('tea', 5, 35, 10, 0),
  'sweet tea': d('tea', 110, 30, 10, 28),
  // other
  'lemonade': d('other', 150, 0, 10, 40)
}

/** A kind's typical figures, for a name the table doesn't hold. */
const KIND_DEFAULTS: Record<DrinkKind, DrinkInfo> = {
  soda: d('soda', 150, 35, 50, 40),
  sports: d('sports', 80, 0, 160, 21),
  energy: d('energy', 160, 115, 200, 40),
  coffee: d('coffee', 5, 140, 5, 0),
  tea: d('tea', 5, 35, 10, 0),
  other: d('other', 150, 0, 10, 40)
}

const KIND_WORDS: Array<[RegExp, DrinkKind]> = [
  [/gatorade|powerade|body ?armor|propel|pedialyte|electrolyte|sports? drink|liquid i\.?v/, 'sports'],
  [/red ?bull|monster|celsius|energy/, 'energy'],
  [/coffee|latte|cold brew|espresso|americano|cappuccino/, 'coffee'],
  [/\btea\b/, 'tea'],
  [/lemonade|juice/, 'other']
]

/** What a logged drink is and holds per 12 fl oz. A blank or unknown name is a regular soda. */
export function drinkInfo(name: string | null | undefined): DrinkInfo {
  const key = (name ?? '').trim().toLowerCase()
  const known = DRINKS[key]
  if (known) return known
  const kind = KIND_WORDS.find(([re]) => re.test(key))?.[1] ?? 'soda'
  const base = KIND_DEFAULTS[kind]
  // "diet", "zero", "sugar-free": the sugar and its calories go, the rest of the kind stays.
  return /\b(diet|zero|sugar.?free|unsweet(ened)?)\b/.test(key) ? { ...base, kcal: 0, sugar_g: 0 } : base
}

/** The picker's list, grouped by kind in display spelling (app/data/journal.ts builds its items from it). */
export const DRINK_GROUPS: Array<{ kind: DrinkKind, label: string, names: string[] }> = [
  { kind: 'soda', label: 'Soda', names: ['Dr Pepper', 'Dr Pepper Cherry', 'Coke', 'Cherry Coke', 'Diet Coke', 'Coke Zero', 'Wild Cherry Pepsi', 'Sprite', '7 Up', '7 Up Shirley Temple', 'Mountain Dew', 'Root Beer', 'Mr Pibb', 'Orange Fanta', 'Orange Crush', 'Canada Dry', 'Canada Dry Fruit Splash', 'Ginger Ale'] },
  { kind: 'sports', label: 'Sports drink', names: ['Gatorade', 'Gatorade Zero', 'Powerade', 'Powerade Zero', 'Body Armor', 'Body Armor Lyte', 'Propel', 'Pedialyte'] },
  { kind: 'energy', label: 'Energy drink', names: ['Red Bull', 'Monster', 'Celsius'] },
  { kind: 'coffee', label: 'Coffee', names: ['Coffee', 'Cold Brew'] },
  { kind: 'tea', label: 'Tea', names: ['Iced Tea', 'Sweet Tea'] },
  { kind: 'other', label: 'Other', names: ['Lemonade'] }
]

export const DRINK_KIND_LABELS: Record<DrinkKind, string> = Object.fromEntries(DRINK_GROUPS.map(g => [g.kind, g.label])) as Record<DrinkKind, string>

/** A logged drink as these helpers read it. */
export interface DrinkLike {
  time?: string | null
  drink?: string | null
  size?: string | null
}

/** Whether an entry counts on the SODA meter. */
export function isSodaEntry(e: DrinkLike): boolean {
  return drinkInfo(e.drink).kind === 'soda'
}

/** Only the sodas of a drink list — what every "N sodas" figure counts. */
export function sodasOnly<T extends DrinkLike>(list: readonly T[] | null | undefined): T[] {
  return (list ?? []).filter(isSodaEntry)
}

/** Whether a drink's ounces count toward the water goal: sports and electrolyte drinks do. */
export function hydrates(name: string | null | undefined): boolean {
  return drinkInfo(name).kind === 'sports'
}

export interface DrinkFigures {
  oz: number
  kcal: number
  caffeine_mg: number
  sodium_mg: number
  sugar_g: number
}

/** One logged drink's figures at its size, or null when the size carries no volume. */
export function drinkFigures(drink: string | null | undefined, size: string | null | undefined): DrinkFigures | null {
  const oz = sodaOunces(size)
  if (oz == null) return null
  const info = drinkInfo(drink)
  const scale = oz / 12
  return {
    oz,
    kcal: Math.round(info.kcal * scale),
    caffeine_mg: Math.round(info.caffeine_mg * scale),
    sodium_mg: Math.round(info.sodium_mg * scale),
    sugar_g: Math.round(info.sugar_g * scale)
  }
}

export interface DrinkTotals {
  kcal: number
  caffeine_mg: number
  sodium_mg: number
  sugar_g: number
  /** Entries whose size carried no volume, and so no figures: the totals are a floor. */
  unsized: number
  /** Ounces of drinks that count toward the water goal. */
  hydratingOz: number
  /** HH:MM of the last drink with caffeine in it, or null. */
  lastCaffeine: string | null
}

/** A day's drink list summed. */
export function drinkTotals(list: readonly DrinkLike[] | null | undefined): DrinkTotals {
  const t: DrinkTotals = { kcal: 0, caffeine_mg: 0, sodium_mg: 0, sugar_g: 0, unsized: 0, hydratingOz: 0, lastCaffeine: null }
  for (const e of list ?? []) {
    const f = drinkFigures(e.drink, e.size)
    if (!f) {
      t.unsized++
      continue
    }
    t.kcal += f.kcal
    t.caffeine_mg += f.caffeine_mg
    t.sodium_mg += f.sodium_mg
    t.sugar_g += f.sugar_g
    if (hydrates(e.drink)) t.hydratingOz += f.oz
    if (f.caffeine_mg > 0 && e.time && (t.lastCaffeine == null || e.time > t.lastCaffeine)) t.lastCaffeine = e.time
  }
  t.hydratingOz = Math.round(t.hydratingOz * 10) / 10
  return t
}

/** A day's water: the logged pours plus the sports drinks' ounces. */
export function hydrationOz(day: { water?: Array<{ oz?: number | null }> | null, sodas?: readonly DrinkLike[] | null } | null | undefined): number {
  let oz = 0
  for (const w of day?.water ?? []) if (typeof w.oz === 'number' && Number.isFinite(w.oz)) oz += w.oz
  return Math.round((oz + drinkTotals(day?.sodas).hydratingOz) * 10) / 10
}

/** Caffeine after this hour is the kind that costs sleep (a ~5 h half-life leaves half of it at bedtime). */
export const LATE_CAFFEINE_HOUR = 14

/** Milligrams of caffeine drunk at or after LATE_CAFFEINE_HOUR. */
export function lateCaffeineMg(list: readonly DrinkLike[] | null | undefined): number {
  let mg = 0
  for (const e of list ?? []) {
    const f = drinkFigures(e.drink, e.size)
    if (f && e.time && Number(e.time.slice(0, 2)) >= LATE_CAFFEINE_HOUR) mg += f.caffeine_mg
  }
  return mg
}
