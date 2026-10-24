import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BARE_EYED, DEMO_UNREACHABLE, FEVER_BPM, WORLD_DAYS, accessoriesFor, achievementsOf, best, birthdayOf, bowlFor, clockLabel, cobwebsFor,
  crusherWallOf, doseDatesOf, doseKeysOf, feverOf, heldPoseOf, hourOf, hungerOf, isAsleep, isCleanWeek, isInjected, isNight, mealDayOf,
  moodWordOf, oldestOpenVial, paddleScaleFor, reachableAchievements, skyFor, sodasInWeek, unloggedInWeek, walkDayOf, walkPropFor,
  weekTallyOf, workoutHrOf, worldDaysOf
} from '../shared/utils/tickerDay.ts'
import { MANE_TIERS } from '../shared/utils/tickerWardrobe.ts'

const TODAY = '2026-10-23'
const day = (date, over = {}) => ({ date, ...over })

test('the clock: night from dusk to wake, asleep from bedtime, the sky golden at the edges of the day', () => {
  assert.equal(hourOf(null), null)
  assert.equal(hourOf('14:05'), 14)
  assert.equal(clockLabel('14:05'), '2:05 pm')
  assert.equal(clockLabel('00:30'), '12:30 am')
  assert.equal(clockLabel(null), '')
  assert.equal(isNight(19), true)
  assert.equal(isAsleep(19), false)
  assert.equal(isAsleep(22), true)
  assert.equal(isAsleep(5), true)
  assert.equal(isNight(6), false)
  assert.equal(skyFor(null), 'day')
  assert.equal(skyFor(7), 'golden')
  assert.equal(skyFor(12), 'day')
  assert.equal(skyFor(17), 'golden')
  assert.equal(skyFor(23), 'night')
})

test('the plate and the walk fall back one day when today is still empty', () => {
  const dose = [{ compound: 'X', dose: 1, unit: 'mg' }]
  assert.equal(mealDayOf([day('2026-10-22', { peptides: dose })], TODAY), '2026-10-22')
  assert.equal(mealDayOf([day('2026-10-22', { peptides: dose }), day(TODAY, { peptides: dose })], TODAY), TODAY)
  assert.equal(mealDayOf([day('2026-10-21', { peptides: dose })], TODAY), TODAY, 'two days back is too far — today, empty')
  const w = (date, duration_min, workout_type = 'Walk', avg_hr = null) => ({ date, duration_min, workout_type, avg_hr })
  assert.equal(walkDayOf([w('2026-10-22', 30)], TODAY), '2026-10-22')
  assert.equal(walkDayOf([w(TODAY, 30)], TODAY), TODAY)
  assert.equal(workoutHrOf([w(TODAY, 60, 'Walk', 100), w(TODAY, 20, 'Lift', 140)]), 110, 'weighted by duration')
  assert.equal(workoutHrOf([w(TODAY, 60)]), null)
  assert.equal(walkPropFor([w(TODAY, 20, 'Disc Golf'), w(TODAY, 50, 'Traditional Strength Training')]), 'dumbbell', 'the longest session picks the prop')
  assert.equal(walkPropFor([w(TODAY, 20, 'Cycling')]), 'helmet')
  assert.equal(walkPropFor([w(TODAY, 20, 'Yoga')]), null)
  assert.equal(sodasInWeek([day('2026-10-17', { sodas: [{}] }), day('2026-10-16', { sodas: [{}, {}] }), day(TODAY, { sodas: [{}] })], TODAY), 2, 'seven days ending today')
})

test('fever: the newest RHR against a two-week baseline with enough readings, only when fresh', () => {
  const prior = Array.from({ length: 6 }, (_, i) => day(`2026-10-${String(10 + i).padStart(2, '0')}`, { rhr: 50 }))
  assert.deepEqual(feverOf([...prior, day(TODAY, { rhr: 50 + FEVER_BPM })], TODAY), { rhr: 57, baseline: 50, over: 7 })
  assert.equal(feverOf([...prior, day(TODAY, { rhr: 56 })], TODAY), null, 'six over is not a fever')
  assert.equal(feverOf([...prior, day('2026-10-20', { rhr: 60 })], TODAY), null, 'a stale reading never reads as a fever')
  assert.equal(feverOf([...prior.slice(0, 4), day(TODAY, { rhr: 60 })], TODAY), null, 'four prior readings are too few for a baseline')
})

test('hunger: without rules it is fed by anything logged; with them, due doses unlogged after dark make it hungry', () => {
  assert.equal(hungerOf({ rulesApply: false, due: 0, missing: 0, logged: 0, doses: 2, night: false }), 'fed')
  assert.equal(hungerOf({ rulesApply: false, due: 0, missing: 0, logged: 0, doses: 0, night: true }), 'waiting')
  assert.equal(hungerOf({ rulesApply: true, due: 0, missing: 0, logged: 0, doses: 0, night: false }), 'rest')
  assert.equal(hungerOf({ rulesApply: true, due: 0, missing: 0, logged: 1, doses: 1, night: false }), 'fed')
  assert.equal(hungerOf({ rulesApply: true, due: 2, missing: 0, logged: 2, doses: 2, night: true }), 'fed')
  assert.equal(hungerOf({ rulesApply: true, due: 2, missing: 1, logged: 1, doses: 1, night: false }), 'waiting')
  assert.equal(hungerOf({ rulesApply: true, due: 2, missing: 1, logged: 1, doses: 1, night: true }), 'hungry')
})

test('cobwebs gather on unlogged days of the last week (yesterday back, never today)', () => {
  const logged = d => day(d, { peptides: [{ compound: 'X' }] })
  assert.equal(unloggedInWeek([logged('2026-10-22'), logged('2026-10-21'), day(TODAY)], TODAY), 5)
  assert.equal(cobwebsFor(0), 0)
  assert.equal(cobwebsFor(2), 1)
  assert.equal(cobwebsFor(3), 2)
  assert.equal(cobwebsFor(5), 3)
})

test('the mood ladder: one order, read as a pose and as a word', () => {
  const base = { asleep: false, fever: null, drawStatus: null, hunger: 'fed', sluggish: false, sodasToday: 0, recovery: null }
  assert.deepEqual([heldPoseOf(base), moodWordOf(base)], [null, 'steady'])
  assert.deepEqual([heldPoseOf({ ...base, asleep: true, fever: { rhr: 1, baseline: 1, over: 9 } }), moodWordOf({ ...base, asleep: true })], ['asleep', 'asleep'])
  assert.deepEqual([heldPoseOf({ ...base, fever: { rhr: 60, baseline: 50, over: 10 } }), moodWordOf({ ...base, fever: { rhr: 60, baseline: 50, over: 10 } })], ['feverish', 'feverish'])
  assert.deepEqual([heldPoseOf({ ...base, drawStatus: 'today' }), moodWordOf({ ...base, drawStatus: 'today' })], ['nervous', 'nervous'])
  assert.deepEqual([heldPoseOf({ ...base, hunger: 'hungry' }), moodWordOf({ ...base, hunger: 'hungry' })], ['hungry', 'hungry'])
  assert.deepEqual([heldPoseOf({ ...base, drawStatus: 'overdue' }), moodWordOf({ ...base, drawStatus: 'overdue' })], ['impatient', 'impatient'])
  assert.deepEqual([heldPoseOf({ ...base, sluggish: true, sodasToday: 3 }), moodWordOf({ ...base, sluggish: true })], [null, 'sleepy'], 'the sluggish prop draws its own slump')
  assert.deepEqual([heldPoseOf({ ...base, sodasToday: 3 }), moodWordOf({ ...base, sodasToday: 3 })], ['worried', 'queasy'])
  assert.deepEqual([heldPoseOf({ ...base, recovery: 85 }), moodWordOf({ ...base, recovery: 85 })], ['happy', 'great'])
  assert.deepEqual([heldPoseOf({ ...base, recovery: 20 }), moodWordOf({ ...base, recovery: 20 })], ['worried', 'rough'])
  assert.deepEqual([heldPoseOf({ ...base, recovery: 50 }), moodWordOf({ ...base, recovery: 50 })], [null, 'steady'])
})

test('a jab or a swallow: the standing rule, then the oral words, then the catalogue', () => {
  const vialByDefault = () => 'vial'
  assert.equal(isInjected('Testosterone Cypionate', () => 'tablet'), true, 'the rule says injected whatever the catalogue thinks')
  assert.equal(isInjected('Iron Bisglycinate', vialByDefault), false)
  assert.equal(isInjected('Vitamin D3', vialByDefault), false)
  assert.equal(isInjected('Something New', vialByDefault), true)
  assert.equal(isInjected('Something New', () => 'capsule'), false)
  const injected = c => /x/i.test(c)
  assert.equal(bowlFor('waiting', [{ compound: 'X' }], injected), 'bowl-empty')
  assert.equal(bowlFor('fed', [{ compound: 'X' }], injected), 'bowl-shots')
  assert.equal(bowlFor('fed', [{ compound: 'Pill' }], injected), 'bowl-full')
  assert.equal(bowlFor('fed', [{ compound: 'X' }, { compound: 'Pill' }], injected), 'bowl-mixed')
})

test('the props layer: bowl first, mane under the hats, one hat at a time, shades off for the face poses, the vet from three days out', () => {
  const base = { bowl: 'bowl-full', worn: new Set(['crown', 'sweatband', 'shades', 'medal']), carried: null, mane: 0, birthday: false, pose: null, cleanWeek: false, bandaged: false, draw: null }
  assert.deepEqual(accessoriesFor(base), ['bowl-full', 'crown', 'sweatband', 'shades', 'medal'])
  assert.deepEqual(accessoriesFor({ ...base, mane: 2, birthday: true }).slice(1, 3), [MANE_TIERS[1].prop, 'party-hat'], 'the mane goes on before the hat')
  assert.deepEqual(accessoriesFor({ ...base, birthday: true }).slice(0, 2), ['bowl-full', 'party-hat'], 'the party hat beats the crown')
  assert.deepEqual(accessoriesFor({ ...base, carried: 'cap' }).slice(0, 2), ['bowl-full', 'cap'], 'the cap beats the crown')
  assert.ok(accessoriesFor({ ...base, carried: 'dumbbell' }).includes('dumbbell'))
  assert.ok(accessoriesFor({ ...base, carried: 'dumbbell' }).includes('crown'), 'a carried dumbbell leaves the crown on')
  for (const pose of BARE_EYED) assert.ok(!accessoriesFor({ ...base, pose }).includes('shades'), `${pose}: shades off`)
  assert.ok(accessoriesFor({ ...base, pose: 'happy' }).includes('shades'))
  assert.ok(accessoriesFor({ ...base, cleanWeek: true, bandaged: true }).includes('gold-star'))
  assert.ok(accessoriesFor({ ...base, bandaged: true }).includes('bandage'))
  assert.ok(!accessoriesFor({ ...base, draw: { status: 'upcoming', inDays: 4 } }).includes('calendar'))
  assert.ok(accessoriesFor({ ...base, draw: { status: 'upcoming', inDays: 3 } }).includes('calendar'))
  assert.deepEqual(accessoriesFor({ ...base, draw: { status: 'today', inDays: 0 } }).slice(-2), ['calendar', 'lab-coat'])
})

test('dose keys number a compound dosed more than once in the day', () => {
  const doses = [{ compound: 'Iron', dose: 25, unit: 'mg' }, { compound: 'Iron', dose: 25, unit: 'mg' }, { compound: 'HGH', dose: 2, unit: 'iu' }]
  assert.deepEqual(doseKeysOf(doses), ['Iron 25 mg#1', 'Iron 25 mg#2', 'HGH 2 IU#1'])
})

test('the record book and the vitals: best by max or min, skipping blanks; birthdays; the oldest open vial', () => {
  assert.deepEqual(best([{ v: 3 }, { v: null }, { v: 9 }], x => x.v, 'max'), { item: { v: 9 }, value: 9 })
  assert.deepEqual(best([{ v: 3 }, { v: null }, { v: 9 }], x => x.v, 'min'), { item: { v: 3 }, value: 3 })
  assert.equal(best([{ v: null }], x => x.v, 'max'), null)
  assert.equal(birthdayOf('2025-10-23', TODAY), 1)
  assert.equal(birthdayOf('2026-10-23', TODAY), null, 'hatch day itself is not a birthday')
  assert.equal(birthdayOf('2025-10-22', TODAY), null)
  assert.equal(birthdayOf(null, TODAY), null)
  assert.deepEqual(oldestOpenVial([
    { compound: 'A', status: 'active', opened_date: '2026-10-01' },
    { compound: 'B', status: 'active', opened_date: '2026-09-01' },
    { compound: 'C', status: 'sealed', opened_date: null },
    { compound: 'D', status: 'finished', opened_date: '2026-01-01' }
  ], TODAY), { compound: 'B', days: 52 })
  assert.equal(oldestOpenVial([{ compound: 'C', status: 'sealed' }], TODAY), null)
})

test('the schedule: dose dates by compound, the week tally, a clean week', () => {
  const entries = Array.from({ length: 7 }, (_, i) => day(`2026-10-${17 + i}`, { peptides: [{ compound: 'Daily' }] }))
  const dates = doseDatesOf(entries)
  assert.deepEqual([...dates.get('Daily')], ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'])
  const daily = { compound: 'Daily', doseLabel: '1', weekdays: [0, 1, 2, 3, 4, 5, 6], from: '2026-01-01', injected: false }
  const tally = weekTallyOf([daily], dates, TODAY)
  assert.equal(tally.hit, 7)
  assert.deepEqual(tally.missed, [])
  assert.equal(isCleanWeek(tally), true)
  const gappy = weekTallyOf([daily], doseDatesOf(entries.filter(e => e.date !== '2026-10-19')), TODAY)
  assert.deepEqual(gappy.missed, [{ compound: 'Daily', date: '2026-10-19' }])
  assert.equal(isCleanWeek(gappy), false)
  assert.equal(isCleanWeek(null), false)
  assert.equal(isCleanWeek({ hit: 0, missed: [] }), false, 'nothing due is not a clean week')
})

test('the can crusher: one can per soda in the trailing month; a clean month offers last month for practice', () => {
  const entries = [
    day('2026-10-20', { sodas: [{ size: '12oz can' }, { size: '20oz bottle' }] }),
    day('2026-10-01', { sodas: [{ size: '12oz can' }] }),
    day('2026-09-20', { sodas: [{ size: '12oz can' }] })
  ]
  const wall = crusherWallOf(entries, TODAY)
  assert.equal(wall.count, 3, 'Sep 24 → Oct 23 holds the two of Oct 20 and the one of Oct 1; Sep 20 is out')
  assert.deepEqual(wall.cans.map(c => c.week), [0, 0, 3], 'rows by week back from today')
  assert.equal(wall.title, 'SEP 24 – OCT 23 · 3 CANS · 44 OZ')
  assert.equal(wall.practice, false)
  const month = crusherWallOf([day('2026-09-20', { sodas: [{ size: '12oz can' }] })], TODAY)
  assert.equal(month.practice, true, 'nothing this month: last month\'s wall')
  assert.equal(month.count, 1)
  assert.match(month.title, /^AUG 25 – SEP 23 · 1 CAN · 12 OZ$/)
  // Nothing at all: the clean month looks back a month, finds nothing there either, and says so with last month's window.
  assert.deepEqual(crusherWallOf([], TODAY), { cans: [], count: 0, title: 'AUG 25 – SEP 23 · 0 CANS', practice: false })
  assert.equal(paddleScaleFor(null), 1)
  assert.equal(paddleScaleFor(100), 1.2)
  assert.equal(paddleScaleFor(0), 0.7)
})

test('the world\'s month: thirty days ending today, pits for unlogged days, a block on a draw day, cardio by family', () => {
  const entries = [day('2026-10-22', { peptides: [{ compound: 'X' }], sodas: [{ size: '12oz can' }] })]
  const days = worldDaysOf({
    entries,
    health: [{ date: '2026-10-22', recovery_score: 70, sleep_total_min: 400 }],
    workouts: [{ date: '2026-10-22', duration_min: 40, workout_type: 'Outdoor Walk', avg_hr: null }],
    draws: [{ date: '2026-10-22', sources: ['Quest'], markers: { a: 1, b: 2 } }],
    rules: [],
    rulesApply: false,
    doseDates: new Map(),
    today: TODAY
  })
  assert.equal(days.length, WORLD_DAYS)
  assert.equal(days.at(-1).date, TODAY)
  assert.equal(days.at(-1).logged, false)
  const d = days.at(-2)
  assert.deepEqual(d, {
    date: '2026-10-22', logged: true, doses: 1, sodas: [{ oz: 12 }], workoutMin: 40, cardio: true, recovery: 70, sleepMin: 400,
    draw: true, drawLabel: 'Quest · 2 markers', goldStar: false
  })
})

test('achievements: the fixed list behind the wearables, and the three the demo can never reach', () => {
  const all = achievementsOf({
    milestones: [{ prop: 'crown', name: 'the crown', goal: 100, progress: 12, unit: 'days in a row' }],
    loggedDays: 40, cleanWeek: true, finasterideStreak: 10,
    hiScores: { runner: { score: 600, date: TODAY }, crusher: { score: 100, date: TODAY, cleared: true }, world: { score: 50, date: TODAY, cleared: false, feats: ['chain-3'] } },
    pets: 5, visits: 2, draws: 14, scans: 2
  })
  assert.equal(all.length, 17, 'sixteen fixed ones plus a card per wearable milestone')
  assert.deepEqual(all[0], { id: 'crown', name: 'Hundred Days', desc: 'a hundred logged days in a row — the crown', icon: 'i-lucide-crown', goal: 100, progress: 12, unit: 'days in a row', reward: 'crown' })
  const byId = Object.fromEntries(all.map(a => [a.id, a]))
  assert.equal(byId['runner-500'].progress, 600)
  assert.equal(byId['clean-sweep'].progress, 1)
  assert.equal(byId['chain-3'].progress, 1)
  assert.equal(byId['clean-month'].progress, 0)
  assert.equal(byId['clean-week'].progress, 1)
  assert.equal(reachableAchievements(all, false).length, 17)
  const demo = reachableAchievements(all, true)
  assert.equal(demo.length, 15, 'Clean Week is reachable since the sandbox has a schedule (P9)')
  assert.ok(demo.every(a => !DEMO_UNREACHABLE.has(a.id)))
})
