// The quick-log endpoint's decisions (shared/utils/quickLog.ts) — audit #43 item 69.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { QUICK_MEAL_ATTEMPTS, QUICK_MEAL_SQL, isQuickKind, quickMealMessage, quickMealPlan, quickSodaMessage, quickWaterMessage } from '../shared/utils/quickLog.ts'
import { zQuickMeal, zQuickWater, zSodaAdd } from '../shared/utils/schemas.ts'

test('the three kinds, and nothing else', () => {
  assert.equal(isQuickKind('water'), true)
  assert.equal(isQuickKind('soda'), true)
  assert.equal(isQuickKind('meal'), true)
  assert.equal(isQuickKind('dose'), false)
  assert.equal(isQuickKind(undefined), false)
})

test('a meal lands in the slot for the time of day, or the one asked for', () => {
  assert.deepEqual(quickMealPlan({}, '07:15', 'protein shake'), { slot: 'breakfast', text: 'protein shake', unchanged: false, joined: false })
  assert.equal(quickMealPlan({}, '12:30', 'chipotle bowl').slot, 'lunch')
  assert.equal(quickMealPlan(null, '19:00', 'steak + veggies').slot, 'dinner')
  assert.equal(quickMealPlan({}, '07:15', 'beef sticks', 'snack_pm').slot, 'snack_pm')
})

test('a tap never erases a slot: another meal is joined, the same meal changes nothing', () => {
  const food = { breakfast: 'Protein shake + creatine', lunch: 'apple + beef sticks' }
  assert.deepEqual(quickMealPlan(food, '07:15', 'kiwi'), { slot: 'breakfast', text: 'Protein shake + creatine + kiwi', unchanged: false, joined: true })
  assert.deepEqual(quickMealPlan(food, '07:15', 'protein shake + creatine'), { slot: 'breakfast', text: 'Protein shake + creatine', unchanged: true, joined: false }, 'the same meal, however it is cased')
  assert.equal(quickMealPlan(food, '12:00', 'Beef Sticks').unchanged, true, 'already one of the slot\'s parts')
  assert.equal(quickMealPlan({ lunch: '  ' }, '12:00', 'apple').text, 'apple', 'a blank slot is empty')
})

test('the answers read as one line', () => {
  assert.equal(quickWaterMessage(8, 48, 100), 'Logged 8 oz water. 48 of 100 oz today.')
  assert.equal(quickSodaMessage('Dr Pepper', '12oz can', true, 2, true), 'Logged Dr Pepper 12oz can. 2 sodas today.')
  assert.equal(quickSodaMessage('Dr Pepper', '12oz can', true, 1, true), 'Logged Dr Pepper 12oz can. 1 soda today.')
  assert.equal(quickSodaMessage('Gatorade', '20oz bottle', false, 0, true), 'Logged Gatorade 20oz bottle.', 'not a soda: no count')
  assert.equal(quickSodaMessage(undefined, undefined, true, 1, true), 'Logged Soda. 1 soda today.')
  assert.equal(quickSodaMessage('Dr Pepper', '12oz can', true, 2, false), 'Dr Pepper 12oz can was already logged.')
  const est = { kcal: 150, protein_g: 30 }
  assert.equal(quickMealMessage({ slot: 'breakfast', text: 'protein shake', unchanged: false, joined: false }, 'protein shake', est), 'Breakfast: protein shake. 150 kcal, 30 g protein.')
  assert.equal(quickMealMessage({ slot: 'lunch', text: 'apple + kiwi', unchanged: false, joined: true }, ' kiwi ', { kcal: 42, protein_g: 0.8 }), 'Lunch: added kiwi. 42 kcal, 1 g protein.')
  assert.equal(quickMealMessage({ slot: 'dinner', text: 'steak', unchanged: true, joined: false }, 'steak', est), 'Dinner already has steak.')
})

test('every body is optional except a meal\'s text', () => {
  assert.equal(zQuickWater.safeParse({}).success, true, 'a bare NFC tap')
  assert.equal(zQuickWater.safeParse({ oz: 16 }).success, true)
  assert.equal(zQuickWater.safeParse({ oz: 0 }).success, false)
  assert.equal(zQuickWater.safeParse({ oz: 999 }).success, false)
  assert.equal(zSodaAdd.safeParse({}).success, true)
  assert.equal(zQuickMeal.safeParse({}).success, false)
  assert.equal(zQuickMeal.safeParse({ text: 'protein shake' }).success, true)
  assert.equal(zQuickMeal.safeParse({ text: 'protein shake', slot: 'brunch' }).success, false)
  assert.equal(zQuickMeal.safeParse({ text: 'x', date: '2026-13-40' }).success, false)
})

test('a Shortcut\'s Text field for ounces is read as a number', () => {
  assert.equal(zQuickWater.parse({ oz: '8' }).oz, 8)
  assert.equal(zQuickWater.parse({ oz: ' 16.5 ' }).oz, 16.5)
  assert.equal(zQuickWater.parse({ oz: '' }).oz, undefined, 'a blank field is the cup')
  assert.equal(zQuickWater.safeParse({ oz: 'a lot' }).success, false)
  assert.equal(zQuickWater.safeParse({ oz: '-4' }).success, false)
})

// Audit #44 item 35: the meal write against the REAL schema in node:sqlite. It lands only while
// the slot still holds what the plan read; otherwise nothing changes and the endpoint plans again.
test('the meal write joins what the plan saw and refuses a slot that moved under it', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8'))
  const write = (date, slot, text, held) => Number(db.prepare(QUICK_MEAL_SQL).run(date, slot, text, held).changes)
  const food = date => JSON.parse(db.prepare('SELECT food FROM journal_entries WHERE date = ?').get(date).food)
  const D = '2031-01-05'
  // No row yet: created with the one slot.
  assert.equal(write(D, 'lunch', 'chicken bowl', ''), 1)
  assert.deepEqual(food(D), { lunch: 'chicken bowl' })
  // Another slot on the same day, empty as planned: set, the first kept.
  assert.equal(write(D, 'dinner', 'salmon', ''), 1)
  assert.deepEqual(food(D), { lunch: 'chicken bowl', dinner: 'salmon' })
  // The plan read lunch as empty, but a meal was typed there since: nothing is written.
  assert.equal(write(D, 'lunch', 'apple', ''), 0, 'the old unconditional write replaced "chicken bowl" here')
  assert.deepEqual(food(D), { lunch: 'chicken bowl', dinner: 'salmon' })
  // Planned again against what is there: joined.
  const plan = quickMealPlan(food(D), '12:30', 'apple', 'lunch')
  assert.deepEqual([plan.text, plan.joined], ['chicken bowl + apple', true])
  assert.equal(write(D, plan.slot, plan.text, food(D).lunch), 1)
  assert.deepEqual(food(D), { lunch: 'chicken bowl + apple', dinner: 'salmon' })
  // A row created by a soda tap (food defaults to '{}'): the empty slot is still '' to the guard.
  db.prepare('INSERT INTO journal_entries (date, sodas) VALUES (?1, json_array(json(?2)))').run('2031-01-06', '{"time":"09:10"}')
  assert.equal(write('2031-01-06', 'breakfast', 'eggs', ''), 1)
  assert.deepEqual(food('2031-01-06'), { breakfast: 'eggs' })
  assert.ok(QUICK_MEAL_ATTEMPTS >= 2, 'at least one re-plan before giving up')
})
