import type { LabsEntry } from '#shared/types/labs'
import { computeMarkers } from '~/data/biomarkers'

export function useLabsEntries() {
  return useListResource<LabsEntry[]>('labs', '/api/labs/list', {
    // Derived markers (Trig/HDL, HOMA-IR, etc.) are computed here rather than stored, so they
    // stay in sync if a formula changes and never need a migration or re-upload.
    transform: entries => entries.map(e => ({ ...e, markers: computeMarkers(e.markers) }))
  })
}
