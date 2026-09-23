import type { WorkoutEntry } from '#shared/types/journal'

export function useWorkoutsEntries() {
  return useListResource<WorkoutEntry[]>('workouts', '/api/workouts/list')
}
