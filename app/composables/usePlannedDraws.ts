import type { PlannedDraw } from '#shared/utils/plannedDraws'

export function usePlannedDraws() {
  return useListResource<PlannedDraw[]>('/labs/planned', '/api/labs/planned/list', { label: 'planned draws' })
}
