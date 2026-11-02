import type { JournalEntry } from '~/data/journal'

// The biggest list (~290 KB inlined): fetched by the browser after mount, not during SSR.
export function useJournalEntries() {
  return useListResource<JournalEntry[]>('/journal', '/api/journal/list', { label: 'journal entries', clientOnly: true })
}
