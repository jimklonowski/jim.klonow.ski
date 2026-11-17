import type { JournalEntry } from '~/data/journal'

// The biggest list (~290 KB inlined): fetched by the browser after mount, not during SSR.
//
// Every fetch is overlaid with the taps the quick-log outbox has not delivered yet (app/utils/
// journalPatch.ts): a refresh hands back the server's list, which cannot hold them, and without
// the overlay a queued pour dropped off the day until it landed (audit #44 item 6).
export function useJournalEntries() {
  return useListResource<JournalEntry[]>('/journal', '/api/journal/list', { label: 'journal entries', clientOnly: true, transform: withPendingTaps })
}
