// Photo SETS (the accutane plan, items 5–8): a set is a named shooting sequence — the categories,
// IN THE ORDER THEY ARE SHOT, that make up one session. It lives only in code; the photo row
// stores a category, never a set, and since 2026-11-06 no category is in two sets (the acne set
// has its own chest and face buckets — its close-ups are not the physique mirror shots), so the
// category alone says which record a photo belongs to.
//
// Two pure rules live here so the pages share them and the tests pin them:
//   defaultPhotoSet  — which set a page opens on (the acne set while the isotretinoin course runs)
//   assignPhotoSlots — a batch dropped under a set is filed by EXIF capture time, first shot →
//                      first open slot, so shooting in the fixed order means no per-file tapping.
import type { PhotoCategory } from './photoCategories.ts'
import { cycleStatusOn, type Cycle } from './cycles.ts'

export interface PhotoSet {
  key: string
  label: string
  /** Shooting order. */
  categories: readonly PhotoCategory[]
  /** A cycle running one of these makes this the default set while it is active. */
  compounds: readonly string[]
  /** One line under the checklist; the frames only compare if the setup repeats. */
  hint?: string
}

export const PHOTO_SETS = [
  {
    key: 'physique',
    label: 'Physique',
    categories: ['chest', 'left_bicep', 'right_bicep', 'face', 'hairline', 'crown'],
    compounds: []
  },
  {
    key: 'acne',
    label: 'Acne',
    categories: ['acne_chest', 'acne_face', 'face_left', 'face_right', 'left_shoulder', 'right_shoulder', 'left_upper_arm', 'right_upper_arm'],
    compounds: ['Isotretinoin'],
    hint: 'Same spot, same light, same distance, arms relaxed — a before/after only reads when the frames match.'
  }
] as const satisfies readonly PhotoSet[]

export type PhotoSetKey = typeof PHOTO_SETS[number]['key']

export function photoSet(key: PhotoSetKey): PhotoSet {
  return PHOTO_SETS.find(s => s.key === key)!
}

export function isPhotoSetKey(value: unknown): value is PhotoSetKey {
  return typeof value === 'string' && PHOTO_SETS.some(s => s.key === value)
}

/** The sets a category belongs to, in PHOTO_SETS order — one at most, since no bucket is shared. */
export function photoSetsOf(category: string): PhotoSetKey[] {
  return PHOTO_SETS.filter(s => (s.categories as readonly string[]).includes(category)).map(s => s.key)
}

/**
 * The set a page opens on for `date`: the first set whose compound is in a cycle active that
 * day, else the first set. Opening on the acne set while the course runs is the whole nudge —
 * nothing is scheduled, the page just assumes today's session is the one the course needs.
 */
export function defaultPhotoSet(cycles: readonly Cycle[], date: string): PhotoSetKey {
  const running = new Set<string>()
  for (const c of cycles) {
    if (cycleStatusOn(c, date) !== 'active') continue
    for (const item of c.compounds) running.add(item.compound)
  }
  return PHOTO_SETS.find(s => s.compounds.some(name => running.has(name)))?.key ?? PHOTO_SETS[0].key
}

export interface PhotoShot {
  /** The day the shot belongs to (the EXIF day in the viewer's zone). */
  date: string
  /** Capture instant, for ordering within the day; ms since epoch. */
  takenAt: number
}

/**
 * File a dropped batch into a set's slots. Per day, the shots are ordered by capture time and
 * handed the day's OPEN slots in shooting order — a slot already on file for that day (or in
 * an earlier drop still queued) is skipped, so re-shooting the three you missed files them
 * where they belong. More shots than open slots wrap to the set's first slot: the extras are
 * guesses to fix by hand, never a crash. Returns one category per shot, in the input order.
 * Only the set's own categories count as taken — a physique chest shot the same day leaves the
 * acne chest slot open.
 */
export function assignPhotoSlots(
  setKey: PhotoSetKey,
  shots: readonly PhotoShot[],
  onFile: readonly { date: string, category: string }[]
): PhotoCategory[] {
  const slots = photoSet(setKey).categories
  const takenByDate = new Map<string, Set<string>>()
  for (const p of onFile) {
    if (!takenByDate.has(p.date)) takenByDate.set(p.date, new Set())
    takenByDate.get(p.date)!.add(p.category)
  }

  const byDate = new Map<string, number[]>()
  shots.forEach((s, i) => {
    if (!byDate.has(s.date)) byDate.set(s.date, [])
    byDate.get(s.date)!.push(i)
  })

  const out: PhotoCategory[] = new Array(shots.length)
  for (const [date, indexes] of byDate) {
    const taken = takenByDate.get(date) ?? new Set<string>()
    const open = slots.filter(c => !taken.has(c))
    const ordered = [...indexes].sort((a, b) => shots[a]!.takenAt - shots[b]!.takenAt || a - b)
    ordered.forEach((shotIndex, n) => {
      out[shotIndex] = n < open.length ? open[n]! : slots[(n - open.length) % slots.length]!
    })
  }
  return out
}
