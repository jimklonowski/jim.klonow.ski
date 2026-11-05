// Progress-photo categories, shared by the upload/edit UIs (app/pages/journal/photos.vue,
// app/pages/journal/[date].vue) and the API validators (server/api/journal/photos/*) so adding
// a bucket is one edit, not five. `value` is exactly what progress_photos.category stores.
//
// 'hairline' and 'crown' were a single 'hairline' bucket until 2026-09-17: the front/forehead
// shots stayed 'hairline', the straight-down top-of-head shots moved to 'crown'
// (server/database/archive/migrate-photo-crown-2026-09-17.sql). R2 object keys embed the category the
// photo was uploaded under and are never rewritten — the key is an opaque handle.
//
// 2026-11-05 (the accutane plan, item 4): six more buckets for the isotretinoin course — the
// truncal-acne regions (shoulders, upper arms) and the face from the sides. 'face' keeps its
// value and becomes the front shot, so nothing on file moves. The categories group into shooting
// SETS in shared/utils/photoSets.ts; this module stays the flat list the validators need.
export const PHOTO_CATEGORIES = [
  { value: 'chest', label: 'Chest' },
  { value: 'left_bicep', label: 'Left Bicep' },
  { value: 'right_bicep', label: 'Right Bicep' },
  { value: 'face', label: 'Face (front)' },
  { value: 'face_left', label: 'Face (left)' },
  { value: 'face_right', label: 'Face (right)' },
  { value: 'hairline', label: 'Hairline' },
  { value: 'crown', label: 'Crown' },
  { value: 'left_shoulder', label: 'Left Shoulder' },
  { value: 'right_shoulder', label: 'Right Shoulder' },
  { value: 'left_upper_arm', label: 'Left Upper Arm' },
  { value: 'right_upper_arm', label: 'Right Upper Arm' }
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
