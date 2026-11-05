import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PHOTO_CATEGORIES, PHOTO_SETS, isPhotoCategory, photoCategoryLabel, photoSet, photoSetsOf } from '../shared/utils/photoCategories.ts'

test('every category has a unique value and label', () => {
  const values = PHOTO_CATEGORIES.map(c => c.value)
  const labels = PHOTO_CATEGORIES.map(c => c.label)
  assert.equal(new Set(values).size, values.length)
  assert.equal(new Set(labels).size, labels.length)
  for (const v of values) assert.ok(isPhotoCategory(v), v)
  assert.equal(isPhotoCategory('back'), false)
  assert.equal(photoCategoryLabel('face'), 'Face (front)', 'the pre-split face bucket is the front shot')
  assert.equal(photoCategoryLabel('whatever'), 'whatever')
})

test('the two shooting sets are made of real categories, in shooting order, with no repeats', () => {
  assert.deepEqual(PHOTO_SETS.map(s => s.key), ['physique', 'acne'])
  for (const set of PHOTO_SETS) {
    assert.equal(new Set(set.categories).size, set.categories.length, `${set.key} repeats a slot`)
    for (const c of set.categories) assert.ok(isPhotoCategory(c), `${set.key}: ${c}`)
  }
  assert.equal(photoSet('physique').categories.length, 6)
  assert.equal(photoSet('acne').categories.length, 8)
  // Chest is the one shared shot; the acne-only regions belong to acne alone, and the physique
  // arms (flexed biceps) are not the acne arms (upper arm from the side).
  assert.deepEqual(photoSetsOf('chest'), ['physique', 'acne'])
  assert.deepEqual(photoSetsOf('left_upper_arm'), ['acne'])
  assert.deepEqual(photoSetsOf('left_bicep'), ['physique'])
  assert.deepEqual(photoSetsOf('nope'), [])
})
