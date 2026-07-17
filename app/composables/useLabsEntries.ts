import { computeMarkers } from '~/data/biomarkers'

export interface QualitativeResult {
  name: string
  result: string
  category?: 'echo' | 'genetic'
}

export interface LabsEntry {
  date: string
  fasting: boolean
  sources: string[]
  markers: Record<string, number | null>
  qualitative: QualitativeResult[]
  ai_summary?: string | null
}

export function useLabsEntries() {
  const requestFetch = useRequestFetch()
  return useAsyncData('labs', async () => {
    const entries = await requestFetch<LabsEntry[]>('/api/labs/list')
    // Derived markers (Trig/HDL, HOMA-IR, etc.) are computed here rather than stored, so they
    // stay in sync if a formula changes and never need a migration or re-upload.
    return entries.map(e => ({ ...e, markers: computeMarkers(e.markers) }))
  })
}
