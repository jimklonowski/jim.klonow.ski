import type { PgxNote } from '#shared/utils/pgx'

/** The drug-gene notes (audit #43 item 78): hand-entered, shown beside the compounds and markers they bear on. */
export function usePgxNotes() {
  return useListResource<PgxNote[]>('/journal/pgx', '/api/journal/pgx/list', { label: 'drug-gene notes' })
}
