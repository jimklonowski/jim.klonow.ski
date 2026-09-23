import type { Vial } from '~/data/journal'

export function useVials() {
  return useListResource<Vial[]>('/journal/vials', '/api/journal/vials/list')
}
