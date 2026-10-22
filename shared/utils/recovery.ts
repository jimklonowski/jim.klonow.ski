// Whoop's recovery bands, in one place (audit #42 item 41: five files each drew their own lines —
// >80, ≥80, ≥67, ≥60, <34 and <40 — so the pet, the digest, the trends tile and the world could
// read the same morning differently). Whoop's own zones: green at 67% and up, red under 34%,
// yellow between. The peak line is this app's: the day the pet calls "thriving" and the digest
// lets stand without a caveat. Plain TS, no imports.

export const RECOVERY_GREEN_MIN = 67
export const RECOVERY_RED_MAX = 34
export const RECOVERY_PEAK_MIN = 80

export type RecoveryZone = 'green' | 'yellow' | 'red'

export function recoveryZone(score: number): RecoveryZone {
  if (score >= RECOVERY_GREEN_MIN) return 'green'
  if (score >= RECOVERY_RED_MAX) return 'yellow'
  return 'red'
}

/** A peak-band day: the pet thrives, the digest skips its caveat. */
export function isPeakRecovery(score: number | null | undefined): boolean {
  return score != null && score >= RECOVERY_PEAK_MIN
}
