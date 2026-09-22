import type { HealthMetricsEntry } from '#shared/types/journal'

export function useHealthMetricsEntries() {
  const requestFetch = useRequestFetch()
  return useAsyncData('health-metrics', () => requestFetch<HealthMetricsEntry[]>('/api/health-metrics/list'))
}
