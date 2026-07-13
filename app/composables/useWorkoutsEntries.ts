export interface WorkoutEntry {
  id: number
  external_id: string | null
  date: string
  workout_type: string | null
  start_time: string | null
  duration_min: number | null
  calories: number | null
  avg_hr: number | null
  max_hr: number | null
  distance_mi: number | null
}

export function useWorkoutsEntries() {
  const requestFetch = useRequestFetch()
  return useAsyncData('workouts', () => requestFetch<WorkoutEntry[]>('/api/workouts/list'))
}
