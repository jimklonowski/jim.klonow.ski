// The upload path both photo uploaders share: the photos page's bulk queue and a day entry's
// single-photo drop zone. Their UIs differ (a per-file list vs one preview with a confirm), so
// only this logic is shared.
//
// exifr is imported where it is used, not here: a static import put the whole EXIF parser
// (74 KB) on the day-entry page and the photos page at every open, for a file that on most
// visits is never picked (audit #44 item 57). tests/drift.test.mjs holds it out.
import type { PhotoCategory } from '#shared/utils/photoCategories'
import { createPhotoThumbnail } from './photoThumbnail'

export function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * The instant a photo was taken: EXIF DateTimeOriginal (or CreateDate), else the file's
 * modified time. EXIF times carry no offset and mean "wall clock where the photo was taken",
 * so exifr hands them back as a local Date; comparing two from one session orders the shots.
 */
export async function photoTakenAt(file: File): Promise<Date> {
  let exifDate: unknown
  try {
    const { default: exifr } = await import('exifr')
    const tags = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
    exifDate = tags?.DateTimeOriginal ?? tags?.CreateDate
  }
  catch {
    // Not an image exifr can read, no EXIF at all, or the parser did not load (offline): fall
    // through to the file time.
  }
  return exifDate instanceof Date ? exifDate : new Date(file.lastModified)
}

/** The day a photo was taken, in the viewer's local zone (see photoTakenAt). */
export async function photoDateOf(file: File): Promise<string> {
  return localDateStr(await photoTakenAt(file))
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
