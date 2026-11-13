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
// list that wasn't in base is kept. A save replayed against the same base is a no-op for the
// lists (see mergeList). Pure and framework-free so it is unit-tested in plain node.
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
  const arrived = minus(current, base)
  const gone = minus(base, current)
  // The same save can arrive twice with the same base: its response was lost and the user
  // pressed Save again, or the list refresh (or the move) after it failed, so the form never
  // learned the row had changed. The row then already holds this form's own additions and lacks
  // its removals, and applying them again doubled every added drink and pour and took a second
  // identical row for each removal (audit #44 item 2). So an addition the row already holds is
  // not appended again, and a removal the row has already seen is not taken again. Rows the form
  // adds carry a tap id, so "already holds" means that very row, not one that looks like it.
  const fresh = minus(added, arrived)
  const pending = minus(removed, gone)
  const elsewhere = minus(arrived, added)
  const list = [...minus(current, pending), ...fresh].sort(byTime)
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
