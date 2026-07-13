export interface HealthMetricsEntry {
  date: string
  vo2_max: number | null
  body_fat_pct: number | null
  lean_body_mass_lbs: number | null
  sleep_total_min: number | null
  sleep_rem_min: number | null
  sleep_deep_min: number | null
  sleep_core_min: number | null
  sleep_awake_min: number | null
}

export function useHealthMetricsEntries() {
  const requestFetch = useRequestFetch()
  return useAsyncData('health-metrics', () => requestFetch<HealthMetricsEntry[]>('/api/health-metrics/list'))
}
