import type { MarkerGoal } from '#shared/utils/markerGoals'

/** The dated marker goals (audit #43 item 60): the cycle dossier's GOALS block and the home strip's verdict. */
export function useMarkerGoals() {
  return useListResource<MarkerGoal[]>('/journal/goals', '/api/journal/goals/list', { label: 'marker goals' })
}
