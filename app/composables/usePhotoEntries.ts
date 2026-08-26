export interface ProgressPhoto {
  id: number
  date: string
  category: 'chest' | 'left_bicep' | 'right_bicep' | 'face' | 'hairline'
  url: string
  thumbUrl: string | null
  taken_at: string | null
  created_at: string
  frameOffsetX: number
  frameOffsetY: number
  frameScale: number
}

export function usePhotoEntries() {
  const requestFetch = useRequestFetch()
  return useAsyncData('/journal/photos', () => requestFetch<ProgressPhoto[]>('/api/journal/photos/list'), {
    // Nuxt 4 consults getCachedData on refresh() too (granularCachedData) — only serve
    // the payload cache on initial load, or refreshPhotos() after an upload is a no-op.
    getCachedData: (key, app, ctx) => {
      if (ctx.cause !== 'initial') return undefined
      const d = app.payload.data[key]
      return d?.length ? d : undefined
    }
  })
}
