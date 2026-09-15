// The site stores the WBC differential absolute counts in cells/uL (BIOMARKERS refs are 1500–7800
// and so on), but not every lab prints them that way: Quest uses cells/uL, while CHW and some older
// panels use K/uL (thousand/uL), so the same draw arrives as 4.8 instead of 4800. The PDF extractor
// and the save endpoint both run markers through here so the stored history stays in one unit.
// Kept app-import-free (like cycles.ts) so plain-node tests can run it.

export const ABS_DIFFERENTIAL_KEYS = [
  'abs_neutrophils', 'abs_lymphocytes', 'abs_monocytes', 'abs_eosinophils', 'abs_basophils'
] as const

/**
 * Neutrophils below 100 cells/uL would be agranulocytosis, so a small neutrophil (or, failing
 * that, lymphocyte) value is an unambiguous sign the whole differential is in K/uL. Eosinophils
 * and basophils are legitimately < 100 cells/uL and can't be judged on their own, which is why the
 * draw is converted as a unit rather than value by value.
 */
export function isDifferentialInKPerUl(markers: Record<string, unknown>): boolean {
  const anchor = [markers.abs_neutrophils, markers.abs_lymphocytes]
    .find((v): v is number => typeof v === 'number')
  return anchor != null && anchor < 100
}

/** Returns a copy with the five absolute counts in cells/uL; the same object when already there. */
export function normalizeAbsDifferential<T extends Record<string, unknown>>(markers: T): T {
  if (!isDifferentialInKPerUl(markers)) return markers
  const out: Record<string, unknown> = { ...markers }
  for (const key of ABS_DIFFERENTIAL_KEYS) {
    const v = out[key]
    if (typeof v === 'number') out[key] = Math.round(v * 1000)
  }
  return out as T
}
