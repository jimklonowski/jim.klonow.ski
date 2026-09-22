// What counts as a real move in a vital, in one place. A change in a window average smaller
// than these is ordinary day-to-day variance. Two engines judge vitals and must agree:
//   - the cycle vitals watch (shared/utils/cycleSignals.ts), on the dossier and home strip;
//   - the digest trend engine (server/utils/trends.ts), which picks what the AI recaps call a trend.
// They used to hold separate copies of these numbers with a "keep in sync" comment, so a trend
// could be flagged by one and dismissed by the other.

export type NoiseMetric = 'weight' | 'bp_systolic' | 'rhr' | 'hrv' | 'recovery' | 'sleep'

/** Minimum change in a window average, in the metric's own unit, that is worth reporting. */
export const METRIC_NOISE_FLOOR: Record<NoiseMetric, number> = {
  weight: 2.5, // lbs
  bp_systolic: 6, // mmHg
  rhr: 4, // bpm
  hrv: 7, // ms
  recovery: 8, // Whoop recovery %
  sleep: 30 // minutes per night
}

/** Fewer readings than this in a comparison window is an anecdote, not an average. */
export const MIN_WINDOW_POINTS = 4
