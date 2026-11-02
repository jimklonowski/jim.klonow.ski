import type { HealthMetricsEntry } from '#shared/types/journal'

// Fetched by the browser after mount, not during SSR (with the journal and workouts lists).
export function useHealthMetricsEntries() {
  return useListResource<HealthMetricsEntry[]>('health-metrics', '/api/health-metrics/list', { label: 'health metrics', clientOnly: true })
}
