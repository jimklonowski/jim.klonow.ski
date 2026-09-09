import type { Vaccination } from '#shared/utils/vaccines'

export function useVaccinations() {
  const requestFetch = useRequestFetch()
  return useAsyncData('/journal/vaccines', () => requestFetch<Vaccination[]>('/api/journal/vaccines/list'), {
    // Nuxt 4 consults getCachedData on refresh() too (granularCachedData) — only serve
    // the payload cache on initial load, or refresh() after an edit is a no-op.
    getCachedData: (key, app, ctx) => {
      if (ctx.cause !== 'initial') return undefined
      const d = app.payload.data[key]
      return d?.length ? d : undefined
    }
  })
}
