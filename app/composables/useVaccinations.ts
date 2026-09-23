import type { Vaccination } from '#shared/utils/vaccines'

export function useVaccinations() {
  return useListResource<Vaccination[]>('/journal/vaccines', '/api/journal/vaccines/list')
}
