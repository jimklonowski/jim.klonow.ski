import type { Cycle } from '#shared/utils/cycles'

export function useCycles() {
  return useListResource<Cycle[]>('/journal/cycles', '/api/journal/cycles/list')
}
