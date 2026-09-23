import type { JournalEntry } from '~/data/journal'

export function useJournalEntries() {
  return useListResource<JournalEntry[]>('/journal', '/api/journal/list')
}
