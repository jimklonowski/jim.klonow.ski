export interface Digest {
  id: number
  type: 'daily' | 'weekly'
  period_start: string
  period_end: string
  summary: string
  stats: Record<string, number | null>
  created_at: string | null
}

// Lazy: only fetched when the digest panel is first opened (immediate: false → call execute()).
export function useDigests() {
  const requestFetch = useRequestFetch()
  return useAsyncData('digests', () => requestFetch<Digest[]>('/api/journal/digest/list'), {
    immediate: false,
    default: () => [] as Digest[]
  })
}
