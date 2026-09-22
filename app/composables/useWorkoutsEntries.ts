import type { WorkoutEntry } from '#shared/types/journal'

export function useWorkoutsEntries() {
  const requestFetch = useRequestFetch()
  return useAsyncData('workouts', () => requestFetch<WorkoutEntry[]>('/api/workouts/list'))
}
