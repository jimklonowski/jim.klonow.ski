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
    getCachedData: (key, app) => {
      const d = app.payload.data[key]
      return d?.length ? d : undefined
    }
  })
}
