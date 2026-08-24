import type { Supplement } from '~/data/journal'

export function useSupplements() {
  const requestFetch = useRequestFetch()
  return useAsyncData('/journal/supplements', () => requestFetch<Supplement[]>('/api/journal/supplements/list'), {
    getCachedData: (key, app) => {
      const d = app.payload.data[key]
      return d?.length ? d : undefined
    }
  })
}
