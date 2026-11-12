// The quick-log endpoint's decisions (audit #43 item 69): `POST /api/quick/{water|soda|meal}`
// is what an iOS Shortcut, an NFC tag or the Action Button calls — no browser, no session, its
// own bearer token. The route (server/api/quick/[kind].post.ts) does the writes; what it logs
// when the caller says little, and the one line it answers with, are decided here so they can be
// tested. Every default mirrors the site's own quick buttons: + CUP pours the profile's cup,
// + SODA repeats the last soda.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { mealKey } from './mealKey.ts'
import { MEAL_SLOT_LABELS, slotForTime, type MealEstimate, type MealSlot } from './nutrition.ts'

export const QUICK_KINDS = ['water', 'soda', 'meal'] as const
export type QuickKind = typeof QUICK_KINDS[number]

export function isQuickKind(v: unknown): v is QuickKind {
  return typeof v === 'string' && (QUICK_KINDS as readonly string[]).includes(v)
}

export interface QuickMealPlan {
  slot: MealSlot
  /** What the slot will hold. */
  text: string
  /** The slot already held exactly this meal: nothing to write. */
  unchanged: boolean
  /** The slot held something else, which this joins ("apple + beef sticks"). */
  joined: boolean
}

/**
 * Where a quick-logged meal goes and what the slot then reads. The slot is the caller's, else
 * the main meal for the time of day. A slot that already holds another meal is joined with
 * " + " — the log's own way of writing two things eaten together, which the figures sum — and
 * never overwritten: a tap must not erase what was typed. The same meal again changes nothing.
 */
export function quickMealPlan(food: Partial<Record<MealSlot, string | null | undefined>> | null | undefined, time: string, text: string, slot?: MealSlot | null): QuickMealPlan {
  const target = slot ?? slotForTime(time)
  const typed = text.trim()
  const held = food?.[target]?.trim() ?? ''
  if (!held) return { slot: target, text: typed, unchanged: false, joined: false }
  const parts = held.split(/\s+\+\s+|\s*,\s*/)
  if (mealKey(held) === mealKey(typed) || parts.some(p => mealKey(p) === mealKey(typed))) return { slot: target, text: held, unchanged: true, joined: false }
  return { slot: target, text: `${held} + ${typed}`, unchanged: false, joined: true }
}

// --- the one line a Shortcut shows back ---

export function quickWaterMessage(oz: number, totalOz: number, goalOz: number): string {
  return `Logged ${oz} oz water. ${totalOz} of ${goalOz} oz today.`
}

export function quickSodaMessage(drink: string | undefined, size: string | undefined, isSoda: boolean, sodasToday: number, appended: boolean): string {
  const what = [drink || 'Soda', size].filter(Boolean).join(' ')
  if (!appended) return `${what} was already logged.`
  return isSoda ? `Logged ${what}. ${sodasToday} soda${sodasToday === 1 ? '' : 's'} today.` : `Logged ${what}.`
}

export function quickMealMessage(plan: QuickMealPlan, typed: string, estimate: Pick<MealEstimate, 'kcal' | 'protein_g'>): string {
  const slot = MEAL_SLOT_LABELS[plan.slot]
  if (plan.unchanged) return `${slot} already has ${typed.trim()}.`
  return `${slot}: ${plan.joined ? `added ${typed.trim()}` : typed.trim()}. ${estimate.kcal} kcal, ${Math.round(estimate.protein_g)} g protein.`
}
