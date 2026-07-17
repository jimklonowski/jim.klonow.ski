import type { Vial } from '~/data/journal'

export function useVials() {
  const requestFetch = useRequestFetch()
  return useAsyncData('/journal/vials', () => requestFetch<Vial[]>('/api/journal/vials/list'), {
    getCachedData: (key, app) => {
      const d = app.payload.data[key]
      return d?.length ? d : undefined
    }
  })
}
