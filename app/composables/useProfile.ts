import type { Profile } from '#shared/utils/profile'

export function useProfile() {
  const requestFetch = useRequestFetch()
  return useAsyncData('/journal/profile', () => requestFetch<Profile>('/api/journal/profile'), {
    // Nuxt 4 consults getCachedData on refresh() too (granularCachedData) — only serve
    // the payload cache on initial load, or refresh() after an edit is a no-op.
    getCachedData: (key, app, ctx) => {
      if (ctx.cause !== 'initial') return undefined
      const d = app.payload.data[key] as Profile | undefined
      return d && Object.keys(d).length ? d : undefined
    }
  })
}
