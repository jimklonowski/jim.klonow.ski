// Progress-photo categories, shared by the upload/edit UIs (app/pages/journal/photos.vue,
// app/pages/journal/[date].vue) and the API validators (server/api/journal/photos/*) so adding
// a bucket is one edit, not five. `value` is exactly what progress_photos.category stores.
//
// 'hairline' and 'crown' were a single 'hairline' bucket until 2026-09-17: the front/forehead
// shots stayed 'hairline', the straight-down top-of-head shots moved to 'crown'
// (server/database/archive/migrate-photo-crown-2026-09-17.sql). R2 object keys embed the category the
// photo was uploaded under and are never rewritten — the key is an opaque handle.
export const PHOTO_CATEGORIES = [
  { value: 'chest', label: 'Chest' },
  { value: 'left_bicep', label: 'Left Bicep' },
  { value: 'right_bicep', label: 'Right Bicep' },
  { value: 'face', label: 'Face' },
  { value: 'hairline', label: 'Hairline' },
  { value: 'crown', label: 'Crown' }
] as const

export type PhotoCategory = typeof PHOTO_CATEGORIES[number]['value']

const CATEGORY_SET = new Set<string>(PHOTO_CATEGORIES.map(c => c.value))

/** Type guard for untrusted input (query string, request body). */
export function isPhotoCategory(value: unknown): value is PhotoCategory {
  return typeof value === 'string' && CATEGORY_SET.has(value)
}

/** Display label for a stored value; falls back to the raw value for anything unknown. */
export function photoCategoryLabel(value: string): string {
  return PHOTO_CATEGORIES.find(c => c.value === value)?.label ?? value
}
