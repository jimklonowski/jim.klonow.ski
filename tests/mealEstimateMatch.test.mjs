// Unit tests for pairing the model's nutrition items back to the meal texts
// (shared/utils/mealEstimateMatch.ts), audit #42 item 5.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchEstimateItems } from '../shared/utils/mealEstimateMatch.ts'

const texts = ['veggie lasagna', 'alpha plate', 'homemade california rolls']
const item = (text, kcal) => ({ text, kcal })
const pairs = r => r.matched.map(m => [m.text, m.item.kcal])

test('a verbatim answer in order pairs every input', () => {
  const r = matchEstimateItems(texts, [item('veggie lasagna', 500), item('alpha plate', 600), item('homemade california rolls', 400)])
  assert.deepEqual(pairs(r), [['veggie lasagna', 500], ['alpha plate', 600], ['homemade california rolls', 400]])
  assert.deepEqual(r.unmatched, [])
})

test('a reordered answer pairs by the echoed text, never by position', () => {
  const r = matchEstimateItems(texts, [item('homemade california rolls', 400), item('Veggie Lasagna', 500), item('alpha plate', 600)])
  assert.deepEqual(pairs(r), [['veggie lasagna', 500], ['alpha plate', 600], ['homemade california rolls', 400]])
  assert.deepEqual(r.unmatched, [])
})

test('an answer one item short leaves the missing meal without figures instead of taking a neighbour’s', () => {
  // The model skipped "alpha plate"; the old `items[i]` fallback would have cached the rolls' 400 under it.
  const r = matchEstimateItems(texts, [item('veggie lasagna', 500), item('homemade california rolls', 400)])
  assert.deepEqual(pairs(r), [['veggie lasagna', 500], ['homemade california rolls', 400]])
  assert.deepEqual(r.unmatched, ['alpha plate'])
})

test('an echo that merely re-words the input still matches by key (stopwords, order, plurals)', () => {
  // "a plate of alpha" → key "alpha plate"; "lasagna, veggie" → "lasagna veggie" — same rows as the inputs.
  const r = matchEstimateItems(texts, [item('a plate of alpha', 600), item('lasagna, veggie', 500), item('homemade california rolls', 400)])
  assert.deepEqual(pairs(r), [['veggie lasagna', 500], ['alpha plate', 600], ['homemade california rolls', 400]])
  assert.deepEqual(r.unmatched, [])
})

test('a paraphrased echo falls back to its position when the answer is one-to-one and the slot is free', () => {
  // "alpha dinner plate" keys differently from "alpha plate"; slot 1 is free and echoes no other input.
  const r = matchEstimateItems(texts, [item('veggie lasagna', 500), item('alpha dinner plate', 600), item('homemade california rolls', 400)])
  assert.deepEqual(pairs(r), [['veggie lasagna', 500], ['homemade california rolls', 400], ['alpha plate', 600]])
  assert.deepEqual(r.unmatched, [])
})

test('a paraphrase in a reordered answer is not read positionally when that slot echoes another input', () => {
  // Slot 1 holds the rolls (another input's text) — "alpha plate" must not be given 400.
  const r = matchEstimateItems(texts, [item('veggie lasagna', 500), item('homemade california rolls', 400), item('alpha dinner plate', 600)])
  assert.deepEqual(pairs(r), [['veggie lasagna', 500], ['homemade california rolls', 400]])
  assert.deepEqual(r.unmatched, ['alpha plate'])
})

test('no positional fallback at all when the answer is not one-to-one', () => {
  const r = matchEstimateItems(texts, [item('veggie lasagna', 500), item('alpha dinner plate', 600)])
  assert.deepEqual(pairs(r), [['veggie lasagna', 500]])
  assert.deepEqual(r.unmatched, ['alpha plate', 'homemade california rolls'])
  const extra = matchEstimateItems(['veggie lasagna'], [item('lasagna with vegetables', 500), item('garlic bread', 150)])
  assert.deepEqual(pairs(extra), [])
  assert.deepEqual(extra.unmatched, ['veggie lasagna'])
})

test('two inputs that normalize alike share one item; a blank input is never matched', () => {
  // "beef stick" keys like "beef sticks" (plural fold) → the same row, not the stranger in its slot.
  const r = matchEstimateItems(['beef sticks', 'beef stick', '   '], [item('beef sticks', 200), item('x', 1), item('y', 2)])
  assert.deepEqual(pairs(r), [['beef sticks', 200], ['beef stick', 200]])
  assert.deepEqual(r.unmatched, ['   '])
})
