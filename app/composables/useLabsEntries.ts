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
}

export function useLabsEntries() {
  const requestFetch = useRequestFetch()
  return useAsyncData('labs', () => requestFetch<LabsEntry[]>('/api/labs/list'))
}
