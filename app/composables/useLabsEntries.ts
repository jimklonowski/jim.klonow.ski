export interface LabsEntry {
  date: string
  fasting: boolean
  sources: string[]
  markers: Record<string, number | null>
}

export function useLabsEntries() {
  const requestFetch = useRequestFetch()
  return useAsyncData('labs', () => requestFetch<LabsEntry[]>('/api/labs/list'))
}
