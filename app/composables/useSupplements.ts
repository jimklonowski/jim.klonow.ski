import type { Supplement } from '~/data/journal'

export function useSupplements() {
  return useListResource<Supplement[]>('/journal/supplements', '/api/journal/supplements/list')
}
