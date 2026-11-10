// The daily protein target (audit #43 item 63): a fixed figure on the profile when one is set,
// else grams per pound of lean mass × the latest DEXA scan's lean — so the target moves with the
// body instead of sitting where it was typed. Pure; the hub's food card and the home INTAKE meter
// read it, and each says which rule produced the number.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { profileNumber } from './profile.ts'

/** A scan as the target reads it: the date and the whole-body lean figure, when the report had one. */
export interface LeanScan {
  date: string
  total: { lean_mass_lbs?: number | null }
}

export interface ProteinTarget {
  /** Whole grams a day. */
  grams: number
  /** 'fixed' = protein_target_g as typed; 'lean' = protein_per_lb_lean × the scan's lean mass. */
  source: 'fixed' | 'lean'
  perLb?: number
  lean?: number
  scanDate?: string
}

/**
 * The target as of `asOf` (the latest scan on or before it; every scan when omitted), or null
 * when neither rule has what it needs. A fixed target always wins: it is the override.
 */
export function proteinTargetFor(profile: Record<string, string> | null | undefined, scans: readonly LeanScan[], asOf?: string): ProteinTarget | null {
  const fixed = profileNumber(profile, 'protein_target_g', 0)
  if (fixed > 0) return { grams: Math.round(fixed), source: 'fixed' }
  const perLb = profileNumber(profile, 'protein_per_lb_lean', 0)
  if (perLb <= 0) return null
  const scan = [...scans]
    .filter(s => s.total?.lean_mass_lbs != null && s.total.lean_mass_lbs > 0 && (!asOf || s.date <= asOf))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)
  if (!scan) return null
  const lean = scan.total.lean_mass_lbs!
  return { grams: Math.round(perLb * lean), source: 'lean', perLb, lean, scanDate: scan.date }
}

/** "1 g/lb × 148.2 lb lean · DEXA Sep 12" for a lean-derived target; "set by hand" for a fixed one. `scanLabel` is the formatted scan date. */
export function proteinTargetNote(target: ProteinTarget, scanLabel: string): string {
  if (target.source === 'fixed') return 'set by hand'
  return `${target.perLb} g/lb × ${Number(target.lean!.toFixed(1))} lb lean · DEXA ${scanLabel}`
}
