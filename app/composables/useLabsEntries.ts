import type { LabsEntry } from '#shared/types/labs'
import { isCensored } from '#shared/utils/labNotes'
import { computeMarkers } from '~/data/biomarkers'

export function useLabsEntries() {
  return useListResource<LabsEntry[]>('labs', '/api/labs/list', {
    label: 'lab results',
    // Derived markers (Trig/HDL, HOMA-IR, etc.) are computed here rather than stored, so they
    // stay in sync if a formula changes and never need a migration or re-upload. A draw's own
    // notes say which of its readings are bounds no derived value may be built on.
    transform: entries => entries.map(e => ({ ...e, markers: computeMarkers(e.markers, e.fasting, k => isCensored(e, k)) }))
  })
}
