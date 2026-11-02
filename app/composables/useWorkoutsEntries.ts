import type { WorkoutEntry } from '#shared/types/journal'

// ~230 KB inlined: fetched by the browser after mount, not during SSR.
export function useWorkoutsEntries() {
  return useListResource<WorkoutEntry[]>('workouts', '/api/workouts/list', { label: 'workouts', clientOnly: true })
}
