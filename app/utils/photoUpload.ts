// The upload path both photo uploaders share: the photos page's bulk queue and a day entry's
// single-photo drop zone. Their UIs differ (a per-file list vs one preview with a confirm), so
// only this logic is shared.
import exifr from 'exifr'
import type { PhotoCategory } from '#shared/utils/photoCategories'
import { createPhotoThumbnail } from './photoThumbnail'

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * The day a photo was taken: EXIF DateTimeOriginal (or CreateDate), else the file's modified
 * time. Read in the viewer's local zone, since EXIF times carry no offset and mean
 * "wall clock where the photo was taken".
 */
export async function photoDateOf(file: File): Promise<string> {
  let exifDate: unknown
  try {
    const tags = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
    exifDate = tags?.DateTimeOriginal ?? tags?.CreateDate
  }
  catch {
    // Not an image exifr can read (or no EXIF at all): fall through to the file time.
  }
  return localDateStr(exifDate instanceof Date ? exifDate : new Date(file.lastModified))
}

/**
 * Upload the original, then its browser-made thumbnail. The thumbnail is best-effort: if it
 * fails, the grid falls back to the full-size image for this photo. Throws only when the
 * original itself didn't upload. Returns the new photo's id.
 */
export async function uploadProgressPhoto(file: File, category: PhotoCategory, date: string): Promise<number> {
  const params = new URLSearchParams({ category, date })
  const created = await $fetch<{ id: number }>(`/api/journal/photos/upload?${params}`, { method: 'POST', body: file })
  try {
    const thumb = await createPhotoThumbnail(file)
    await $fetch(`/api/journal/photos/thumbnail?id=${created.id}`, { method: 'POST', body: thumb })
  }
  catch {
    // Best-effort, see above.
  }
  return created.id
}
