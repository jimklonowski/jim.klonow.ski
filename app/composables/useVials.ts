import type { Vial } from '~/data/journal'

export function useVials() {
  const requestFetch = useRequestFetch()
  return useAsyncData('/journal/vials', () => requestFetch<Vial[]>('/api/journal/vials/list'), {
    // Nuxt 4 consults getCachedData on refresh() too (granularCachedData) — only serve
    // the payload cache on initial load, or refresh() after an edit is a no-op.
    getCachedData: (key, app, ctx) => {
      if (ctx.cause !== 'initial') return undefined
      const d = app.payload.data[key]
      return d?.length ? d : undefined
    }
  })
}
