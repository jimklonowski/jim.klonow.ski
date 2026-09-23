import type { HealthMetricsEntry } from '#shared/types/journal'

export function useHealthMetricsEntries() {
  return useListResource<HealthMetricsEntry[]>('health-metrics', '/api/health-metrics/list')
}
