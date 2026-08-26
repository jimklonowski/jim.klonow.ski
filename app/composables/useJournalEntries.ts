import type { JournalEntry } from '~/data/journal'

export function useJournalEntries() {
  const requestFetch = useRequestFetch()
  return useAsyncData('/journal', () => requestFetch<JournalEntry[]>('/api/journal/list'), {
    // Nuxt 4 consults getCachedData on refresh() too (granularCachedData) — only serve
    // the payload cache on initial load, or refresh() after a save is a no-op.
    getCachedData: (key, app, ctx) => {
      if (ctx.cause !== 'initial') return undefined
      const d = app.payload.data[key]
      return d?.length ? d : undefined
    }
  })
}
