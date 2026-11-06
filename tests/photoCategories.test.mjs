import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PHOTO_CATEGORIES, isPhotoCategory, photoCategoryLabel } from '../shared/utils/photoCategories.ts'
import { PHOTO_SETS, assignPhotoSlots, defaultPhotoSet, isPhotoSetKey, photoSet, photoSetsOf } from '../shared/utils/photoSets.ts'

test('every category has a unique value and label', () => {
  const values = PHOTO_CATEGORIES.map(c => c.value)
  const labels = PHOTO_CATEGORIES.map(c => c.label)
  assert.equal(new Set(values).size, values.length)
  assert.equal(new Set(labels).size, labels.length)
  for (const v of values) assert.ok(isPhotoCategory(v), v)
  assert.equal(isPhotoCategory('back'), false)
  assert.equal(photoCategoryLabel('face'), 'Face (front)', 'the pre-split face bucket is the physique front shot')
  assert.equal(photoCategoryLabel('acne_face'), 'Face (acne)')
  assert.equal(photoCategoryLabel('whatever'), 'whatever')
})

test('the two shooting sets are made of real categories, in shooting order, and share none', () => {
  assert.deepEqual(PHOTO_SETS.map(s => s.key), ['physique', 'acne'])
  for (const set of PHOTO_SETS) {
    assert.equal(new Set(set.categories).size, set.categories.length, `${set.key} repeats a slot`)
    for (const c of set.categories) assert.ok(isPhotoCategory(c), `${set.key}: ${c}`)
  }
  assert.equal(photoSet('physique').categories.length, 6)
  assert.equal(photoSet('acne').categories.length, 8)
  assert.ok(isPhotoSetKey('acne') && !isPhotoSetKey('ACNE'))
  // No bucket is in two sets: the acne chest and face are close-ups with their own framing, not
  // the physique mirror shots, so a category alone says which record a photo belongs to.
  for (const c of PHOTO_CATEGORIES) assert.ok(photoSetsOf(c.value).length <= 1, `${c.value} is in two sets`)
  assert.deepEqual(photoSetsOf('chest'), ['physique'])
  assert.deepEqual(photoSetsOf('acne_chest'), ['acne'])
  assert.deepEqual(photoSetsOf('left_upper_arm'), ['acne'])
  assert.deepEqual(photoSetsOf('left_bicep'), ['physique'])
  assert.deepEqual(photoSetsOf('nope'), [])
})

const course = {
  name: 'Isotretinoin Course',
  start_date: '2026-11-07',
  planned_weeks: 41,
  compounds: [{ compound: 'Isotretinoin', dose: 40, unit: 'mg', weekdays: [0, 1, 2, 3, 4, 5, 6], fromWeek: 1, toWeek: 41 }]
}
const blast = {
  name: 'Primo',
  start_date: '2027-07-01',
  planned_weeks: 16,
  compounds: [{ compound: 'Methenolone Enanthate', dose: 100, unit: 'mg', weekdays: [1, 4], fromWeek: 1, toWeek: 16 }]
}

test('the default set is acne only while a cycle running isotretinoin is active that day', () => {
  assert.equal(defaultPhotoSet([], '2026-11-20'), 'physique')
  assert.equal(defaultPhotoSet([course], '2026-11-06'), 'physique', 'the day before the course')
  assert.equal(defaultPhotoSet([course], '2026-11-07'), 'acne', 'day one')
  assert.equal(defaultPhotoSet([course], '2027-08-20'), 'acne', 'last planned day')
  assert.equal(defaultPhotoSet([course], '2027-08-21'), 'physique', 'the day after')
  assert.equal(defaultPhotoSet([{ ...course, actual_end: '2027-03-01' }], '2027-03-02'), 'physique', 'cut short')
  assert.equal(defaultPhotoSet([{ ...course, start_precision: 'month' }], '2026-11-20'), 'physique', 'a tentative start never activates')
  assert.equal(defaultPhotoSet([blast, course], '2027-07-10'), 'acne', 'another active cycle without the compound changes nothing')
})

test('a dropped batch is filed by capture time into the open slots, per day', () => {
  const t = (h, m) => Date.UTC(2026, 10, 7, h, m)
  // Eight shots dropped in an arbitrary order: each lands on the slot its capture time says.
  const shots = [t(8, 7), t(8, 1), t(8, 5), t(8, 2), t(8, 3), t(8, 6), t(8, 4), t(8, 0)].map(takenAt => ({ date: '2026-11-07', takenAt }))
  assert.deepEqual(assignPhotoSlots('acne', shots, []), [
    'right_upper_arm', 'acne_face', 'right_shoulder', 'face_left', 'face_right', 'left_upper_arm', 'left_shoulder', 'acne_chest'
  ])

  // Three re-shot later the same day: the slots already on file are skipped.
  const onFile = ['acne_chest', 'acne_face', 'face_left', 'face_right', 'right_upper_arm'].map(category => ({ date: '2026-11-07', category }))
  const again = [t(18, 2), t(18, 0), t(18, 1)].map(takenAt => ({ date: '2026-11-07', takenAt }))
  assert.deepEqual(assignPhotoSlots('acne', again, onFile), ['left_upper_arm', 'left_shoulder', 'right_shoulder'])

  // One more than the open slots wraps to the first slot — a guess to fix by hand, not an error.
  const extra = [...again, { date: '2026-11-07', takenAt: t(18, 3) }]
  assert.deepEqual(assignPhotoSlots('acne', extra, onFile), ['left_upper_arm', 'left_shoulder', 'right_shoulder', 'acne_chest'])

  // A physique chest shot the same day is another record: the acne chest slot stays open.
  assert.deepEqual(assignPhotoSlots('acne', [{ date: '2026-11-07', takenAt: t(9, 0) }], [{ date: '2026-11-07', category: 'chest' }]), ['acne_chest'])

  // A backfill spanning two days is two sessions: each day starts from its own slot one.
  const twoDays = [
    { date: '2026-11-14', takenAt: Date.UTC(2026, 10, 14, 8, 1) },
    { date: '2026-11-07', takenAt: t(8, 1) },
    { date: '2026-11-14', takenAt: Date.UTC(2026, 10, 14, 8, 0) },
    { date: '2026-11-07', takenAt: t(8, 0) }
  ]
  assert.deepEqual(assignPhotoSlots('physique', twoDays, []), ['left_bicep', 'left_bicep', 'chest', 'chest'])

  // Another day's photos on file don't block today's slots.
  assert.deepEqual(assignPhotoSlots('acne', [{ date: '2026-11-21', takenAt: 1 }], onFile), ['acne_chest'])
})
