// TICKER's wardrobe and build from the data (shared/utils/tickerWardrobe.ts): the four wearable
// milestones, the finasteride mane, the tier, the DEXA arms and belly, and the outfit's paint order.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MANE_TIERS, TIER_DAYS, ageDays, bellyOf, armsOf, buildOf, earnedWearables, firstLoggedDay, leanGain,
  maneTier, nextManeTier, publicWardrobeOf, wardrobeOf, wearableMilestones
} from '../shared/utils/tickerWardrobe.ts'
import { shiftDays } from '../shared/utils/dates.ts'

const TODAY = '2026-10-08'
const vitals = date => ({ date, peptides: [], sodas: [], food: {}, notes: '' })
const dosed = (date, ...compounds) => ({ ...vitals(date), peptides: compounds.map(c => ({ compound: c, dose: 1, unit: 'mg' })) })
/** `n` logged days ending today, the last `fin` of them with finasteride. */
const days = (n, fin = 0) => Array.from({ length: n }, (_, i) => {
  const date = shiftDays(TODAY, -(n - 1 - i))
  return i >= n - fin ? dosed(date, 'HGH', 'Finasteride') : dosed(date, 'HGH')
})
const scan = (date, body_fat_pct, lean_mass_lbs) => ({ date, total: { body_fat_pct, lean_mass_lbs } })
const inputs = (over = {}) => ({ entries: [], workouts: [], scans: [], today: TODAY, ...over })

test('the hatch date is the first hand-logged day, not the first row', () => {
  const entries = [vitals('2020-01-01'), vitals('2026-01-30'), dosed('2026-01-31', 'HGH'), dosed('2026-02-01', 'HGH')]
  assert.equal(firstLoggedDay(entries), '2026-01-31')
  assert.equal(ageDays(entries, '2026-02-10'), 10)
  assert.equal(ageDays([vitals('2020-01-01')], TODAY), null)
})

test('the four wearables each have a goal and are earned by progress alone', () => {
  const none = wearableMilestones(inputs())
  assert.deepEqual(none.map(m => m.prop), ['crown', 'sweatband', 'shades', 'medal'])
  assert.ok(none.every(m => m.progress === 0 && m.goal > 0))
  assert.deepEqual(earnedWearables(inputs()), [])

  const crowned = inputs({ entries: days(100) })
  assert.deepEqual(earnedWearables(crowned), ['crown'])
  const sweaty = inputs({ workouts: Array.from({ length: 100 }, () => ({ duration_min: 60 })) })
  assert.deepEqual(earnedWearables(sweaty), ['sweatband'])
  const old = inputs({ entries: [dosed(shiftDays(TODAY, -365), 'HGH')] })
  assert.deepEqual(earnedWearables(old), ['shades'])
  assert.equal(wearableMilestones(old).find(m => m.prop === 'medal').progress, 1)
})

test('the mane climbs its tiers with the finasteride streak and only that compound', () => {
  assert.equal(maneTier(days(10, 0), TODAY), 0, 'HGH alone grows nothing')
  assert.equal(maneTier(days(10, 7), TODAY), 1)
  assert.equal(maneTier(days(40, 30), TODAY), 2)
  assert.equal(maneTier(days(100, 90), TODAY), 3)
  assert.equal(nextManeTier(days(40, 30), TODAY)?.name, 'luscious')
  assert.equal(nextManeTier(days(100, 90), TODAY), null)
  assert.equal(MANE_TIERS.length, 3)
})

test('the build: tier by logged days, arms by lean gain on the first scan, belly by the latest body fat', () => {
  assert.equal(buildOf(inputs()).tier, 'hatchling')
  assert.equal(buildOf(inputs({ entries: days(TIER_DAYS.grown) })).tier, 'grown')
  assert.equal(buildOf(inputs({ entries: days(TIER_DAYS.elder) })).tier, 'elder')

  const scans = [scan('2026-09-30', 17.6, 139.2), scan('2026-06-12', 20.2, 125.3)] // out of order on purpose
  assert.equal(leanGain(scans), 13.9)
  assert.equal(armsOf(scans), 'built')
  assert.equal(armsOf([scans[1]]), 'lean', 'one scan is no gain')
  assert.equal(bellyOf(scans), 'lean')
  assert.equal(bellyOf([scans[1]]), 'soft')
  assert.equal(bellyOf([scan('2026-12-01', 12.4, 140)]), 'cut')
  assert.equal(bellyOf([]), 'lean')
})

test('the outfit paints the mane before the crown and leaves the day props to the page', () => {
  const outfit = wardrobeOf(inputs({ entries: days(100, 30) }))
  assert.deepEqual(outfit.accessories, ['mane-2', 'crown'])
  assert.deepEqual(outfit.build, { tier: 'grown', arms: 'lean', belly: 'lean' })
  assert.deepEqual(wardrobeOf(inputs()).accessories, [])
})

test('the public outfit keeps the wearables and the tier, never the mane or the DEXA build', () => {
  // A pet with everything to hide: a 90-day finasteride streak, lean mass up on the second scan,
  // and a latest body fat over the soft line.
  const data = inputs({ entries: days(100, 90), scans: [scan('2026-06-12', 20.2, 125.3), scan('2026-09-30', 21.5, 139.2)] })
  const full = wardrobeOf(data)
  assert.deepEqual(full.accessories, ['mane-3', 'crown'])
  assert.deepEqual(full.build, { tier: 'grown', arms: 'built', belly: 'soft' })

  const shown = publicWardrobeOf(data)
  assert.deepEqual(shown.accessories, ['crown'], 'the crown is a logging streak; the mane is a medication')
  assert.deepEqual(shown.build, { tier: 'grown' }, 'the tier is a logged-day count; arms and belly are scan readings')
  assert.deepEqual(publicWardrobeOf(inputs()), { accessories: [], build: { tier: 'hatchling' } })
})
