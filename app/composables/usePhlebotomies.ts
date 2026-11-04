import type { Phlebotomy } from '#shared/utils/hematocrit'

/** Blood removed on purpose — the hematocrit panel's log (/labs/hematocrit). */
export function usePhlebotomies() {
  return useListResource<Phlebotomy[]>('/labs/phlebotomies', '/api/labs/phlebotomies/list', { label: 'phlebotomies' })
}
