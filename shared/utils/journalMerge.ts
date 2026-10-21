// Three-way merge for the day form's save (audit #42 item 1).
//
// journal/save writes every column of a day, but a day is also written piecemeal while the form
// is open: the soda and water quick-adds, the hub's meal quick log, the Apple Health webhook
// filling in vitals. The form only knows the row as it LOADED it, so a plain overwrite deleted
// anything logged elsewhere since (a phone pour vanishing when the laptop saved — only the audit
// log could bring it back).
//
// The form now sends that loaded state as `base`. Field by field: what the form changed (vs base)
// wins, including removals; what it left alone takes the database's CURRENT value, so an append
// made elsewhere survives. Lists (sodas, water) merge as multisets: the form's removals are taken
// off the current list one occurrence each, its additions appended, and anything in the current
// list that wasn't in base is kept. Pure and framework-free so it is unit-tested in plain node.
import { MEAL_SLOTS, type MealSlot } from './nutrition.ts'

export const DAY_VITALS = ['weight_lbs', 'bp_systolic', 'bp_diastolic', 'rhr', 'hrv'] as const
export type DayVital = typeof DAY_VITALS[number]

type Item = Record<string, unknown>

/** The fields a day save decides, as the form (and the base it loaded from) hold them. */
export interface DayLogFields extends Record<DayVital, number | null> {
  sodas: Item[]
  water: Item[]
  food: Partial<Record<MealSlot, string | null | undefined>>
}

export interface MergedDaySave {
  fields: DayLogFields
  /** Human labels of what was kept from the database because the form hadn't touched it: "1 water pour", "lunch", "weight". */
  kept: string[]
}

/** Structural identity for a list item: same keys and values, order-insensitive. */
function itemKey(item: Item): string {
  return JSON.stringify(Object.keys(item).sort().map(k => [k, item[k]]))
}

function sameList(a: Item[], b: Item[]): boolean {
  if (a.length !== b.length) return false
  const ka = a.map(itemKey).sort()
  const kb = b.map(itemKey).sort()
  return ka.every((k, i) => k === kb[i])
}

/** Multiset difference a − b, by item identity. */
function minus(a: Item[], b: Item[]): Item[] {
  const pool = new Map<string, number>()
  for (const item of b) {
    const k = itemKey(item)
    pool.set(k, (pool.get(k) ?? 0) + 1)
  }
  return a.filter((item) => {
    const k = itemKey(item)
    const n = pool.get(k) ?? 0
    if (n > 0) {
      pool.set(k, n - 1)
      return false
    }
    return true
  })
}

function byTime(a: Item, b: Item): number {
  return String(a.time ?? '').localeCompare(String(b.time ?? ''))
}

function mergeList(base: Item[], form: Item[], current: Item[]): { list: Item[], keptCount: number } {
  // Nothing happened elsewhere: the form decides, removals included.
  if (sameList(current, base)) return { list: form, keptCount: 0 }
  const removed = minus(base, form)
  const added = minus(form, base)
  const elsewhere = minus(current, base)
  const list = [...minus(current, removed), ...added].sort(byTime)
  return { list, keptCount: elsewhere.length }
}

const noun = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * What the save should write, given the form's values, the state the form loaded (`base`) and
 * the row as it stands now (`current`, null when the day has no row yet — nothing to keep).
 */
export function mergeDaySave(form: DayLogFields, base: DayLogFields, current: DayLogFields | null): MergedDaySave {
  if (!current) return { fields: form, kept: [] }
  const kept: string[] = []
  const fields = { ...form }

  // Vitals: an untouched field takes the current value (the webhook writes these while a day is open).
  for (const f of DAY_VITALS) {
    if (form[f] === base[f] && current[f] !== base[f] && current[f] != null) {
      fields[f] = current[f]
      kept.push(f === 'weight_lbs' ? 'weight' : f === 'rhr' ? 'RHR' : f === 'hrv' ? 'HRV' : f === 'bp_systolic' ? 'BP' : 'BP')
    }
  }

  const sodas = mergeList(base.sodas, form.sodas, current.sodas)
  fields.sodas = sodas.list
  if (sodas.keptCount) kept.push(noun(sodas.keptCount, 'soda'))

  const water = mergeList(base.water, form.water, current.water)
  fields.water = water.list
  if (water.keptCount) kept.push(noun(water.keptCount, 'water pour'))

  // Food: per slot, the form's edit wins (a cleared slot stays cleared); an untouched slot takes
  // what is there now — the hub's quick log may have filled it meanwhile.
  const food: Partial<Record<MealSlot, string>> = {}
  for (const slot of MEAL_SLOTS) {
    const formVal = (form.food[slot] ?? '').trim()
    const baseVal = (base.food[slot] ?? '').trim()
    const curVal = (current.food[slot] ?? '').trim()
    if (formVal !== baseVal) {
      if (formVal) food[slot] = formVal
    }
    else if (curVal) {
      food[slot] = curVal
      if (curVal !== baseVal) kept.push(slot.replace('_', ' '))
    }
  }
  fields.food = food

  // BP arrives as a pair; name it once.
  return { fields, kept: [...new Set(kept)] }
}
