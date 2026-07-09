import type { JournalEntry } from '~/data/journal'

export function useJournalEntries() {
  const requestFetch = useRequestFetch()
  return useAsyncData('/journal', () => requestFetch<JournalEntry[]>('/api/journal/list'), {
    getCachedData: (key, app) => {
      const d = app.payload.data[key]
      return d?.length ? d : undefined
    }
  })
}
