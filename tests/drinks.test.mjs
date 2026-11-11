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
