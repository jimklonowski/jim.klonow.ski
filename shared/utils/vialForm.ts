// Container form for inventory rows. `vial_amount` is ALWAYS the total content of one
// container — for a pill bottle that is unit_count × per-pill strength (100 × 25 mg tabs →
// 2500 mg) — so the depletion, runway and cycle-coverage math never has to know what shape
// the stock comes in. These helpers translate that total back into label terms for the UI.
// Kept app-import-free (like cycles.ts) so plain-node tests can run it.

export type VialForm = 'vial' | 'tablet' | 'capsule'

export const VIAL_FORMS: { label: string, value: VialForm }[] = [
  { label: 'Vial', value: 'vial' },
  { label: 'Tablets', value: 'tablet' },
  { label: 'Capsules', value: 'capsule' }
]

const FORM_SET = new Set<string>(VIAL_FORMS.map(f => f.value))

/** Coerces an untrusted or legacy value (pre-migration row, request body) to a known form. */
export function normalizeForm(value: unknown): VialForm {
  return typeof value === 'string' && FORM_SET.has(value) ? value as VialForm : 'vial'
}

export function isPillForm(form: string | null | undefined): boolean {
  return form === 'tablet' || form === 'capsule'
}

/** The fields the label-term helpers read — satisfied by app Vial rows and parse results alike. */
export interface ContainerLike {
  form?: string | null
  unit_count?: number | null
  vial_amount: number
  vial_unit: string
}

/** What one container is called: vial / bottle. */
export function containerNoun(form: string | null | undefined, n = 1): string {
  const one = isPillForm(form) ? 'bottle' : 'vial'
  return n === 1 ? one : `${one}s`
}

/** What one countable unit inside a pill bottle is called: tab / cap. */
export function pillNoun(form: string | null | undefined, n = 1): string {
  const one = form === 'capsule' ? 'cap' : 'tab'
  return n === 1 ? one : `${one}s`
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Per-pill strength in vial_unit, or null when the row isn't a countable pill bottle. */
export function pillStrength(v: ContainerLike): number | null {
  if (!isPillForm(v.form) || !v.unit_count || v.unit_count <= 0) return null
  return round3(v.vial_amount / v.unit_count)
}

/** Bottle total from label terms — the value stored in vial_amount. */
export function pillTotal(strength: number, count: number): number {
  return round3(strength * count)
}

/** An amount in vial_unit expressed as pills (remaining mg → tabs left); null for vials. */
export function pillsFromAmount(v: ContainerLike, amount: number): number | null {
  const strength = pillStrength(v)
  if (strength == null || strength <= 0) return null
  return Math.round((amount / strength) * 10) / 10
}

/** One-line contents label: "10mg" for a vial, "100 × 25mg tabs" for a bottle. */
export function describeContents(v: ContainerLike): string {
  const strength = pillStrength(v)
  if (strength == null) return `${v.vial_amount}${v.vial_unit}`
  return `${v.unit_count} × ${strength}${v.vial_unit} ${pillNoun(v.form, v.unit_count ?? 0)}`
}

/** Collective noun for a set of rows: 'vials' | 'bottles', or `mixed` when both are present. */
export function stockNoun(rows: ContainerLike[], mixed = 'units'): string {
  const pills = rows.filter(r => isPillForm(r.form)).length
  if (pills === 0) return 'vials'
  if (pills === rows.length) return 'bottles'
  return mixed
}
