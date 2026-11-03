import type { LabNotes } from '#shared/utils/labNotes'

/**
 * The owner's lab context the client is allowed to hold (server/api/labs/notes.get.ts): the
 * dated events as chart bands and the medication caveats for the marker cards. Pages `await` it
 * like the other stores; a component reads it without awaiting. Before the first answer there
 * are no bands and no caveats; the demo sandbox is answered with none at all.
 */
export function useLabNotes() {
  return useListResource<LabNotes>('lab-notes', '/api/labs/notes', { label: 'lab notes' })
}
