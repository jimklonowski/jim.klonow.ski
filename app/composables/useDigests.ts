export interface Digest {
  id: number
  type: 'daily' | 'weekly'
  period_start: string
  period_end: string
  summary: string
  stats: Record<string, number | null>
  created_at: string | null
  /** Which model wrote it and a hash of its exact prompt; null before provenance was recorded. */
  model: string | null
  prompt_hash: string | null
}

// Lazy: only fetched when the digest panel is first opened (call execute()).
export function useDigests() {
  return useListResource<Digest[]>('digests', '/api/journal/digest/list', { lazy: true, label: 'digests' })
}
