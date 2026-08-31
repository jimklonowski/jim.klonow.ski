// Stock runway — "is the fridge deep enough for the plan?" math behind /tools/inventory.
// Kept app-import-free (like cycles.ts) so plain-node tests can run it: unit conversion and
// vial-remaining math live in the app layer, and callers hand in stock via getOnHand.

// Explicit .ts extension: this import carries runtime values, and the plain-node test runner
// (type stripping, no bundler) can't resolve it extensionless the way Vite does.
import { plannedDoses, cycleStatusOn, type Cycle, type CyclePlanItem } from './cycles.ts'

export interface CycleCoverage {
  compound: string
  unit: CyclePlanItem['unit']
  /** Sum of every dose still ahead of `asOf` — the whole plan for an upcoming cycle. */
  needed: number
  /** Stock expressed in `unit`, or null when the caller can't express it in that unit. */
  onHand: number | null
  short: number
  /** 0–1 fill for the coverage bar; 1 once nothing is needed anymore. */
  pct: number
}

/**
 * Coverage per plan compound for one cycle. Doses already behind `asOf` don't count —
 * mid-cycle the question is "can I finish?", not "could I have started?". A compound's unit
 * comes from its first plan item; plans that mix units for one compound aren't supported
 * (the form never produces them).
 */
export function cycleCoverage(
  cycle: Cycle,
  asOf: string,
  getOnHand: (compound: string, unit: CyclePlanItem['unit']) => number | null
): CycleCoverage[] {
  if (cycleStatusOn(cycle, asOf) === 'done') return []
  const unitByCompound = new Map<string, CyclePlanItem['unit']>()
  for (const item of cycle.compounds) {
    if (!unitByCompound.has(item.compound)) unitByCompound.set(item.compound, item.unit)
  }
  return [...unitByCompound.entries()].map(([compound, unit]) => {
    const needed = plannedDoses(cycle, compound)
      .filter(d => d.date >= asOf)
      .reduce((s, d) => s + d.amount, 0)
    const onHand = getOnHand(compound, unit)
    const short = Math.max(0, needed - (onHand ?? 0))
    const pct = needed <= 0 ? 1 : Math.min(1, (onHand ?? 0) / needed)
    return { compound, unit, needed, onHand, short, pct }
  })
}
