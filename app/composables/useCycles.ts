import type { Cycle } from '#shared/utils/cycles'

export function useCycles() {
  const requestFetch = useRequestFetch()
  return useAsyncData('/journal/cycles', () => requestFetch<Cycle[]>('/api/journal/cycles/list'), {
    // Nuxt 4 consults getCachedData on refresh() too (granularCachedData) — only serve
    // the payload cache on initial load, or refresh() after an edit is a no-op.
    getCachedData: (key, app, ctx) => {
      if (ctx.cause !== 'initial') return undefined
      const d = app.payload.data[key]
      return d?.length ? d : undefined
    }
  })
}
