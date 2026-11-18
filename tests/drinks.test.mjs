// The drink catalogue (shared/utils/drinks.ts) — audit #43 items 70 + 71 and the Gatorade gap.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drinkFigures, drinkInfo, drinkTotals, hydrates, hydrationOz, isSodaEntry, lateCaffeineMg, sodasOnly } from '../shared/utils/drinks.ts'
import { lastSoda, sodaKcal } from '../shared/utils/soda.ts'

test('what a drink is: the table first, then its words, then a regular soda', () => {
  assert.equal(drinkInfo('Dr Pepper').kind, 'soda')
  assert.equal(drinkInfo(' gatorade ').kind, 'sports')
  assert.equal(drinkInfo('Gatorade Fierce Grape').kind, 'sports', 'an unlisted flavour is still a sports drink')
  assert.equal(drinkInfo('Monster Ultra').kind, 'energy')
  assert.equal(drinkInfo('iced latte').kind, 'coffee')
  assert.equal(drinkInfo('Some Local Cola').kind, 'soda', 'an unknown name is what the log held before: a soda')
  assert.equal(drinkInfo('').kind, 'soda')
  assert.equal(drinkInfo('Diet Something').kcal, 0, 'diet strips the sugar')
  assert.equal(drinkInfo('Diet Something').caffeine_mg, 35, '…and keeps the kind\'s caffeine')
  assert.equal(hydrates('Gatorade'), true)
  assert.equal(hydrates('Dr Pepper'), false)
  assert.equal(hydrates('Coffee'), false)
})

test('a version of a table drink reads that drink\'s figures, not a typical soda\'s caffeine (audit #44 item 10)', () => {
  const at = name => drinkInfo(name)
  // The four from the audit: each used to carry 35 mg of caffeine per 12 oz.
  assert.deepEqual(at('Sprite Zero'), { kind: 'soda', kcal: 0, caffeine_mg: 0, sodium_mg: 65, sugar_g: 0 })
  assert.deepEqual(at('Caffeine Free Diet Coke'), { kind: 'soda', kcal: 0, caffeine_mg: 0, sodium_mg: 40, sugar_g: 0 })
  assert.deepEqual(at('7up'), at('7 Up'))
  assert.deepEqual(at('Fanta'), at('Orange Fanta'))
  assert.equal(at('Fanta').caffeine_mg, 0)
  // Spelling, punctuation and word order.
  assert.deepEqual(at('Dr. Pepper'), at('Dr Pepper'))
  assert.deepEqual(at('Cherry Dr Pepper'), at('Dr Pepper Cherry'))
  assert.deepEqual(at('Coca-Cola'), at('Coke'))
  assert.deepEqual(at('Mtn Dew'), at('Mountain Dew'))
  assert.deepEqual(at('Pibb Xtra'), at('Mr Pibb'))
  assert.equal(at('Fanta Grape').caffeine_mg, 0)
  // The base drink's caffeine stays under "diet" / "zero"; only the sugar goes.
  assert.deepEqual(at('Diet Dr Pepper'), { kind: 'soda', kcal: 0, caffeine_mg: 41, sodium_mg: 55, sugar_g: 0 })
  assert.equal(at('Diet Mountain Dew').caffeine_mg, 54)
  assert.equal(at('Vanilla Coke').caffeine_mg, 34)
  assert.equal(at('A&W Root Beer').caffeine_mg, 0)
  // The longest row wins: "diet coke" (46 mg), not "coke" (34 mg).
  assert.equal(at('Diet Coke Lime').caffeine_mg, 46)
  assert.equal(at('Caffeine Free Coke').caffeine_mg, 0)
  assert.equal(at('Caffeine-Free Coke').kcal, 140, 'only the caffeine goes')
  // "Caffeine free" and "decaf" are honoured with no row to go on, and for other kinds.
  assert.equal(at('Caffeine Free Something').caffeine_mg, 0)
  assert.equal(at('Decaf Coffee').caffeine_mg, 0)
  assert.equal(at('Decaf Coffee').kind, 'coffee')
  // A name with no table drink in it is still a typical soda, caffeine and all.
  assert.equal(at('Some Local Cola').caffeine_mg, 35)
  assert.equal(at('Diet Something').caffeine_mg, 35)
  // Other kinds read their own rows the same way, and never change kind by it.
  assert.deepEqual(at('Gatorade Zero Glacier Freeze'), at('Gatorade Zero'))
  assert.equal(at('Monster Zero').kcal, 0)
  assert.equal(at('Monster Zero').caffeine_mg, 120)
  assert.equal(at('Lemonade Gatorade').kind, 'sports')
  assert.equal(at('Coke Energy').kind, 'energy', 'the words decide the kind; the cola row is not used for it')
  assert.equal(at('Coke Energy').caffeine_mg, 115)
  // What it does to a day: a 20 oz Sprite Zero at 16:00 is no late caffeine.
  const day = [{ time: '16:00', drink: 'Sprite Zero', size: '20oz bottle' }, { time: '17:00', drink: '7up', size: '12oz can' }]
  assert.equal(lateCaffeineMg(day), 0)
  assert.equal(drinkTotals(day).lastCaffeine, null)
  assert.equal(sodasOnly(day).length, 2, 'both still count as sodas')
})

test('every table drink is of the kind its own name says, so matching by kind loses none', async () => {
  const { DRINK_GROUPS, drinkSource } = await import('../shared/utils/drinks.ts')
  for (const group of DRINK_GROUPS) {
    for (const name of group.names) {
      assert.equal(drinkInfo(name).kind, group.kind, name)
      assert.equal(drinkInfo(`${name} special edition`).kind, group.kind, `a version of ${name}`)
    }
  }
  assert.equal(drinkSource('Sprite Zero'), 'table')
  assert.equal(drinkSource('7up'), 'table')
  assert.equal(drinkSource('Some Local Cola'), 'typical')
})

test('figures scale with the size; a size without a volume has none', () => {
  assert.deepEqual(drinkFigures('Dr Pepper', '12oz can'), { oz: 12, kcal: 150, caffeine_mg: 41, sodium_mg: 55, sugar_g: 40 })
  assert.deepEqual(drinkFigures('Gatorade', '20oz bottle'), { oz: 20, kcal: 133, caffeine_mg: 0, sodium_mg: 267, sugar_g: 35 })
  assert.equal(drinkFigures('Dr Pepper', 'Fountain - large').caffeine_mg, 109, '32 oz')
  assert.equal(drinkFigures('Dr Pepper', ''), null)
  assert.equal(sodaKcal('Dr Pepper', '20oz bottle'), 250, 'the old helper reads the same table')
  assert.equal(sodaKcal('Coke Zero', '12oz can'), 0)
})

test('a day\'s list: sodas only on the meter, everything in the totals, sports ounces toward water', () => {
  const list = [
    { time: '07:10', drink: 'Coffee', size: '16oz cup' },
    { time: '12:30', drink: 'Dr Pepper', size: '12oz can' },
    { time: '15:45', drink: 'Gatorade', size: '20oz bottle' },
    { time: '16:20', drink: 'Dr Pepper', size: 'Fountain - large' },
    { time: '18:00', drink: 'Sprite', size: '' }
  ]
  assert.deepEqual(sodasOnly(list).map(s => s.time), ['12:30', '16:20', '18:00'])
  assert.equal(isSodaEntry(list[2]), false)
  const t = drinkTotals(list)
  assert.equal(t.kcal, 7 + 150 + 133 + 400)
  assert.equal(t.caffeine_mg, 187 + 41 + 0 + 109)
  assert.equal(t.sodium_mg, 7 + 55 + 267 + 147)
  assert.equal(t.unsized, 1, 'the unsized Sprite has no figures')
  assert.equal(t.hydratingOz, 20)
  assert.equal(t.lastCaffeine, '16:20', 'the Gatorade and the Sprite carry none')
  assert.equal(lateCaffeineMg(list), 109, 'only the 16:20 fountain is after 14:00')
  assert.equal(hydrationOz({ water: [{ oz: 12 }, { oz: 12 }, { oz: null }], sodas: list }), 44)
  assert.equal(hydrationOz({ water: [{ oz: 12 }] }), 12)
  assert.equal(hydrationOz(null), 0)
  assert.deepEqual(drinkTotals(null), { kcal: 0, caffeine_mg: 0, sodium_mg: 0, sugar_g: 0, unsized: 0, hydratingOz: 0, lastCaffeine: null })
})

test('the soda quick-add repeats the last SODA, not the Gatorade logged after it', () => {
  const entries = [
    { date: '2026-11-10', sodas: [{ time: '12:00', drink: 'Dr Pepper', size: '12oz can' }] },
    { date: '2026-11-11', sodas: [{ time: '09:00', drink: 'Gatorade', size: '20oz bottle' }] }
  ]
  assert.equal(lastSoda(entries).drink, 'Dr Pepper')
  assert.equal(lastSoda([entries[1]]), null)
})

test('a soda logged with no name does not become the one the quick-add repeats', () => {
  const named = { date: '2026-11-10', sodas: [{ time: '12:00', drink: 'Dr Pepper', size: '12oz can' }] }
  const nameless = { date: '2026-11-11', sodas: [{ time: '08:00' }, { time: '09:00', drink: '  ', size: '20oz bottle' }] }
  assert.deepEqual(lastSoda([named, nameless]), { time: '12:00', drink: 'Dr Pepper', size: '12oz can', date: '2026-11-10' })
  // With nothing named anywhere, the newest row is still handed back (its size is worth repeating).
  assert.deepEqual(lastSoda([nameless]), { time: '09:00', drink: '  ', size: '20oz bottle', date: '2026-11-11' })
  assert.equal(lastSoda([]), null)
})

// --- the owner's own label figures (drink_labels, migration 0024) ---

test('a label replaces the table\'s figures at any size; the kind still comes from the name', async () => {
  const { indexDrinkLabels, drinkSource, drinkKey } = await import('../shared/utils/drinks.ts')
  const { dayNutrition, indexEstimates } = await import('../shared/utils/nutrition.ts')
  const label = (name, serving_oz, kcal, caffeine_mg, sodium_mg, sugar_g) => ({ key: drinkKey(name), name, serving_oz, kcal, caffeine_mg, sodium_mg, sugar_g })
  // Dr Pepper's table row is 150 / 41 / 55 / 40 per 12 oz; the "label" here is for a 20 oz bottle.
  const labels = indexDrinkLabels([label('Dr Pepper', 20, 240, 68, 100, 64), label('Liquid Death', 16.9, 0, 0, 0, 0)])

  assert.equal(drinkKey('  Dr   PEPPER '), 'dr pepper')
  assert.equal(drinkSource('dr pepper', labels), 'label')
  assert.equal(drinkSource('Coke', labels), 'table')
  assert.equal(drinkSource('Some Local Cola', labels), 'typical')
  assert.equal(drinkSource('Dr Pepper'), 'table', 'no labels → the table')

  assert.deepEqual(drinkFigures('Dr Pepper', '20oz bottle', labels), { oz: 20, kcal: 240, caffeine_mg: 68, sodium_mg: 100, sugar_g: 64 }, 'the container itself reads exactly as printed')
  assert.deepEqual(drinkFigures('Dr Pepper', '12oz can', labels), { oz: 12, kcal: 144, caffeine_mg: 41, sodium_mg: 60, sugar_g: 38 }, 'another size is scaled from the label')
  assert.equal(drinkFigures('Dr Pepper', '12oz can').kcal, 150, 'without the labels the table still answers')
  assert.equal(drinkFigures('Coke', '12oz can', labels).kcal, 140, 'an unlabelled drink is untouched')

  // An unknown name is a soda by its name, label or not: the count does not move.
  assert.equal(drinkInfo('Liquid Death', labels).kind, 'soda')
  assert.equal(drinkFigures('Liquid Death', '16.9oz bottle', labels).kcal, 0)

  const day = [{ time: '15:00', drink: 'Dr Pepper', size: '20oz bottle' }, { time: '09:00', drink: 'Coke', size: '12oz can' }]
  assert.equal(drinkTotals(day, labels).caffeine_mg, 68 + 34)
  assert.equal(lateCaffeineMg(day, labels), 68)
  assert.equal(lateCaffeineMg(day), 68, 'the table happens to agree on a 20 oz Dr Pepper')

  // The labels ride on the estimate index, so a day's nutrition total reads them.
  const withLabels = dayNutrition({ food: {}, sodas: day }, indexEstimates([], labels))
  const without = dayNutrition({ food: {}, sodas: day }, indexEstimates([]))
  assert.equal(withLabels.sodaKcal, 240 + 140)
  assert.equal(without.sodaKcal, 250 + 140)
  assert.equal(withLabels.sodium_mg, 100 + 45)
  assert.equal(indexEstimates([]).drinks, undefined, 'no labels → a plain index')
})

test('tea is neither a soda nor water, unless its name says unsweetened (Jim, 2026-11-12)', () => {
  for (const name of ['Peace Tea', 'peach tea', 'Iced Tea', 'Sweet Tea', 'Peace Tea Peach', 'Arizona green tea']) {
    assert.equal(drinkInfo(name).kind, 'tea', name)
    assert.equal(isSodaEntry({ drink: name }), false, `${name} is not a soda`)
    assert.equal(hydrates(name), false, `${name} is not water`)
  }
  assert.equal(hydrates('Unsweetened Iced Tea'), true)
  assert.equal(hydrates('unsweet tea'), true)
  assert.equal(hydrates('Gatorade'), true, 'sports drinks still count')
  assert.equal(hydrates('Coffee'), false)
  // A 23 oz can of peach tea: on no meter, but its sugar and calories are in the day.
  const day = { water: [{ oz: 24 }], sodas: [{ time: '13:00', drink: 'Peace Tea', size: '23oz can' }, { time: '14:00', drink: 'Unsweetened Iced Tea', size: '16oz cup' }] }
  assert.equal(hydrationOz(day), 40, 'the pours plus the unsweetened tea only')
  assert.equal(sodasOnly(day.sodas).length, 0)
  assert.ok(drinkFigures('Peace Tea', '23oz can').kcal > 100)
  assert.equal(drinkFigures('Unsweetened Iced Tea', '16oz cup').kcal, 0)
})

test('Peace Tea reads its 12 oz can label', () => {
  assert.deepEqual(drinkFigures('Peace Tea', '12oz can'), { oz: 12, kcal: 110, caffeine_mg: 12, sodium_mg: 130, sugar_g: 29 })
  assert.equal(drinkFigures('peach tea', '12oz can').sugar_g, 29)
})
