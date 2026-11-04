import type { DexaMetricMeta } from './dexa'

export const HEALTH_METRICS_META: Record<string, DexaMetricMeta> = {
  vo2_max: {
    label: 'VO2 Max',
    unit: 'ml/kg/min',
    description: 'Maximal oxygen uptake, estimated by Apple Watch during outdoor walks/runs. A strong longevity and cardiovascular fitness marker.'
  },
  body_fat_pct: {
    label: 'Body Fat %',
    unit: '%',
    lowerIsBetter: true,
    description: 'Body fat percentage from the Withings scale (bioelectrical impedance estimate).'
  },
  lean_body_mass_lbs: {
    label: 'Lean Mass',
    unit: 'lbs',
    description: 'Lean body mass from the Withings scale.'
  },
  sleep_total_min: {
    label: 'Sleep Duration',
    unit: 'min',
    description: 'Total time asleep, from Apple Watch/Whoop sleep tracking synced via Apple Health.'
  },
  recovery_score: {
    label: 'Recovery',
    unit: '%',
    description: 'Whoop\'s daily recovery score, based on HRV, resting heart rate, sleep, and other physiological markers. Higher means more prepared for strain.'
  },
  strain: {
    label: 'Strain',
    unit: '',
    description: 'Whoop\'s cumulative cardiovascular load for the day, on a 0-21 scale.'
  },
  sleep_performance_pct: {
    label: 'Sleep Performance',
    unit: '%',
    description: 'Whoop\'s sleep performance score - how much you slept relative to what your body needed.'
  },
  // Apple Health through the Health Auto Export webhook (audit #43 item 56).
  steps: {
    label: 'Steps',
    unit: 'steps',
    description: 'Steps for the day, from Apple Watch and iPhone via Apple Health.'
  },
  active_kcal: {
    label: 'Active Energy',
    unit: 'kcal',
    description: 'Apple Watch\'s estimate of energy spent moving — the activity part of the day\'s expenditure. Days with no watch wear read low, not zero.'
  },
  basal_kcal: {
    label: 'Resting Energy',
    unit: 'kcal',
    description: 'Apple\'s estimate of resting energy for the day (basal metabolic rate scaled to the hours tracked).'
  },
  resp_rate: {
    label: 'Respiratory Rate',
    unit: 'br/min',
    description: 'Breaths per minute during sleep, from Apple Watch. A rise of a breath or two over your own baseline often precedes illness.'
  },
  spo2_pct: {
    label: 'Blood Oxygen',
    unit: '%',
    description: 'Blood oxygen saturation from Apple Watch (spot readings and overnight). Normal is 95–100 % at sea level; readings are noisy and a single low one means little.'
  },
  waist_in: {
    label: 'Waist',
    unit: 'in',
    lowerIsBetter: true,
    description: 'Waist circumference as logged to Apple Health (a tape measurement, not a scale estimate).'
  },
  dietary_water_oz: {
    label: 'Water (Health)',
    unit: 'oz',
    description: 'Water logged to Apple Health for the day (the watch\'s own water logging). Separate from the journal\'s water taps — the two are not merged.'
  }
}

// The formatter itself lives in shared/utils/duration.ts (the pet's voice needs it off the client
// too); every page keeps importing it from here.
export { formatDuration } from '#shared/utils/duration'
