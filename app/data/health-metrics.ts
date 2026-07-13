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
  }
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
