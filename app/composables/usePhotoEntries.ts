import type { PhotoCategory } from '#shared/utils/photoCategories'

export interface ProgressPhoto {
  id: number
  date: string
  category: PhotoCategory
  url: string
  thumbUrl: string | null
  taken_at: string | null
  created_at: string
  frameOffsetX: number
  frameOffsetY: number
  frameScale: number
  /** Rendered mirrored left-to-right, undoing a mirror selfie. */
  frameFlip: boolean
}

export function usePhotoEntries() {
  return useListResource<ProgressPhoto[]>('/journal/photos', '/api/journal/photos/list', { label: 'photos' })
}
