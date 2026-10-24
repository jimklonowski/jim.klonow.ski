import test from 'node:test'
import assert from 'node:assert/strict'
import {
  arrivalLine, dated, doseDoneLine, doseStartLine, drawTile, fedTile, flinchLine, gotLine, helloLine, newsSince, plateLine, playIntroLine,
  quitRemark, quoteLines, recordLines, squeakFor, statTiles, todaySummaryLine, visitorsNews, walkEndLine, walkStartLine
} from '../shared/utils/tickerVoice.ts'

const TODAY = '2026-10-23'

test('dates carry the year only once it is not this one', () => {
  assert.equal(dated('2026-10-03', TODAY), 'Oct 3')
  assert.equal(dated('2025-10-03', TODAY), 'Oct 3 2025')
})

test('the record book: one dated sentence per best, the games included', () => {
  const lines = recordLines({
    entries: [
      { date: '2026-09-01', weight_lbs: 170, rhr: 52, peptides: [{ compound: 'X' }] },
      { date: '2026-09-02', weight_lbs: 168.2, rhr: 49, peptides: [{ compound: 'X' }] },
      { date: '2026-09-03', peptides: [{ compound: 'X' }] }
    ],
    health: [{ date: '2026-09-01', recovery_score: 91, sleep_total_min: 455.6 }, { date: '2026-09-02', recovery_score: 40, sleep_total_min: null }],
    workouts: [{ date: '2025-12-24', duration_min: 95.4, workout_type: 'Disc Golf', avg_hr: null }],
    streak: 3,
    hiScores: { runner: { score: 812, date: '2026-10-01' }, crusher: { score: 300, date: '2026-10-02', cleared: true }, world: null },
    today: TODAY
  })
  assert.deepEqual(lines, [
    'best recovery: 91% on Sep 1.',
    'longest streak: 3 days — this one, still going.',
    'lightest: 168.2 lb on Sep 2.',
    'longest workout: 95 min of Disc Golf on Dec 24 2025.',
    'best night: 7h 36m on Sep 1.',
    'lowest resting HR: 49 bpm on Sep 2.',
    'best run: 812 points on Oct 1.',
    'best crush: 300 points on Oct 2 — and a whole wall cleared, once.'
  ])
})

const quoteBase = {
  weight: null, recovery: null, sleepMin: null, fever: null, rhr: null, latestHrv: null, latestDraw: null, flags: null, nextDraw: null,
  rulesApply: true, due: 0, eaten: 0, missing: 0, missingNames: '', streak: 1, sodasThisWeek: 0, oldestOpen: null, mixes: [], mealIsYesterday: false,
  finasterideStreak: 0, maneTier: 0, nextMane: null, ageDays: null, weekTally: null, cycleClause: '', tier: 'hatchling', loggedDays: 12,
  latestScan: null, belly: 'lean', leanGain: null, arms: 'lean', earned: [], earnedCount: 2, achievementsTotal: 20, nextAchievement: null,
  keeper: true, visits: null, visitorsBests: {}, visitorLabel: null, records: []
}

test('talk skips what the data lacks and always has a streak, a soda count, a tier and the achievements to say', () => {
  assert.deepEqual(quoteLines(quoteBase), [
    '1 day logged in a row. it\'s keeping count.',
    'no sodas this week. it\'s proud of you.',
    '12 logged days — still a hatchling. it grows limbs at 30.',
    'achievements: 2 of 20. every one. there is nothing left to earn, only to keep.'
  ])
})

test('talk quotes each figure in its own words', () => {
  const lines = quoteLines({
    ...quoteBase,
    weight: 169.8, recovery: 72, sleepMin: 400, rhr: 51, latestHrv: 48,
    latestDraw: { date: '2026-10-17' }, flags: { high: 2, low: 1 },
    nextDraw: { status: 'upcoming', inDays: 9, plan: { lab: 'Quest', panel: 'CBC', fasting: true }, drawDate: null },
    due: 2, eaten: 1, missing: 1, missingNames: 'HGH', streak: 14, sodasThisWeek: 2,
    oldestOpen: { compound: 'hCG', days: 31 },
    mixes: [{ compound: 'BPC-157', vial_amount: 5, vial_unit: 'mg', bac_water_ml: 2 }],
    finasterideStreak: 9, maneTier: 1, nextMane: { name: 'mane', days: 30 }, ageDays: 1234,
    weekTally: { hit: 5, missed: [{ compound: 'HGH', date: '2026-10-20' }] }, cycleClause: ' — week 2 of 8 of Primo',
    tier: 'grown', loggedDays: 300, latestScan: { date: '2026-09-30', total: { body_fat_pct: 17.6 } }, belly: 'cut', leanGain: 13.9, arms: 'built',
    earned: [{ prop: 'medal', name: 'the medal', goal: 250, progress: 300, unit: 'logged days' }],
    nextAchievement: { name: 'Elder', goal: 500, progress: 300, unit: 'logged days' },
    visits: { total: 3, pets: 4, recent: [{ date: '2026-10-20', role: 'friend', label: 'Sam', pets: 2, best_run: null, bests: {} }], best: null, bests: {} },
    visitorsBests: { runner: { label: 'Sam', score: 420, date: '2026-10-20' } },
    records: ['best run: 812 points on Oct 1.']
  })
  assert.deepEqual(lines, [
    '169.8 lb at the last weigh-in. it\'s holding that for you.',
    'recovery 72% — green. go lift something.',
    '6h 40m of sleep last night. it felt that.',
    'resting at 51 bpm. that\'s the beat you\'re watching.',
    'hrv 48 ms on the last reading.',
    '2 high, 1 low on the Oct 17 draw.',
    'next draw in 9 days — Quest · CBC · fasting.',
    '1 of 2 due doses down. still waiting on HGH.',
    '14 days logged in a row. it\'s keeping count.',
    '2 sodas this week. it noticed every one.',
    'the hCG vial has been open 31 days.',
    'reconstituted BPC-157 (5 mg in 2 mL) today. FEED mixes it again.',
    'the mane: stubble — 9 days of finasteride; mane at 30',
    '1,234 days since the first logged day. it remembers all of them.',
    '5 of 6 due doses this week — missed HGH Tue — week 2 of 8 of Primo.',
    '300 logged days — grown. an elder at 500; 200 to go.',
    'body fat 17.6% on the Sep 30 scan — cut. look at that.',
    'lean mass +13.9 lb since the first scan — the arms show it.',
    'wearing medal — earned at 250 logged days.',
    'achievements: 2 of 20. next: Elder — 200 logged days to go.',
    'visitors: 3 footprints — last Sam on Oct 20.',
    'visitors\' best run: Sam, 420 points.',
    'for the record — best run: 812 points on Oct 1.'
  ])
  // The server hands a guest a holder's label only when it is their own, so any label a guest sees is "you".
  const guest = quoteLines({ ...quoteBase, keeper: false, visitorLabel: 'Sam', visitorsBests: { runner: { label: 'Sam', score: 420, date: TODAY }, world: { label: null, score: 9, date: TODAY } } })
  assert.ok(guest.includes('visitors\' best run: you, 420 points.'), 'a guest is handed their own name as "you"')
  assert.ok(guest.includes('visitors\' best month: a friend, 9 points.'))
  assert.ok(guest.includes('you\'re on file as Sam. it\'s keeping a footprint.'))
})

const arrivalBase = {
  today: TODAY, asleep: false, birthday: null, firstDate: '2025-06-01', fever: null, awayDays: 0, hunger: 'fed', missing: 0, missingNames: '',
  sluggish: false, sleepMin: null, nextDraw: null, recovery: null, streak: 10, unloggedThisWeek: 0, oldestOpen: null, weight: null, ageDays: null, records: []
}

test('the greeting: the most notable thing first, then an everyday line that rotates by the date', () => {
  assert.equal(arrivalLine({ ...arrivalBase, asleep: true, fever: { rhr: 70, baseline: 50, over: 20 } }), '(asleep — it\'s late. up at 6)')
  assert.equal(arrivalLine({ ...arrivalBase, birthday: 1 }), 'happy birthday — TICKER turns 1 today. (first logged day: Jun 1 2025)')
  assert.equal(arrivalLine({ ...arrivalBase, fever: { rhr: 60, baseline: 51, over: 9 } }), 'rhr 60 — 9 over its two-week average. it\'s running hot; go easy today')
  assert.equal(arrivalLine({ ...arrivalBase, awayDays: 8 }), 'it\'s been 8 days. it stopped counting at a week. (it didn\'t.)')
  assert.equal(arrivalLine({ ...arrivalBase, awayDays: 3 }), 'it\'s been 3 days. it sat down on day one and waited.')
  assert.equal(arrivalLine({ ...arrivalBase, hunger: 'hungry', missing: 1, missingNames: 'HGH' }), 'past dinner and HGH isn\'t logged — TICKER is hungry')
  assert.equal(arrivalLine({ ...arrivalBase, hunger: 'hungry', missing: 2, missingNames: 'HGH, hCG' }), 'past dinner and HGH, hCG aren\'t logged — TICKER is hungry')
  assert.equal(arrivalLine({ ...arrivalBase, sluggish: true, sleepMin: 330 }), '(needs coffee — 5h 30m last night)')
  assert.equal(arrivalLine({ ...arrivalBase, sluggish: true }), '(needs coffee — short night)')
  assert.equal(arrivalLine({ ...arrivalBase, nextDraw: { status: 'today', inDays: 0, plan: { lab: 'Quest', fasting: true } } }), 'draw day. TICKER is nervous on your behalf.')
  assert.equal(arrivalLine({ ...arrivalBase, nextDraw: { status: 'overdue', inDays: -2, plan: { lab: null, fasting: false } } }), 'the planned draw was 2 days ago and nothing\'s on file — it keeps checking')
  assert.equal(arrivalLine({ ...arrivalBase, nextDraw: { status: 'upcoming', inDays: 1, plan: { lab: 'Quest', fasting: true } } }), 'draw tomorrow — fasting, remember')
  assert.equal(arrivalLine({ ...arrivalBase, recovery: 88 }), 'recovery\'s at 88% — TICKER is thriving')
  assert.equal(arrivalLine({ ...arrivalBase, recovery: 20 }), 'recovery 20% — TICKER is taking it easy today')
  assert.equal(arrivalLine({ ...arrivalBase, streak: 100 }), '100 days logged in a row. it counted.')
  assert.equal(arrivalLine({ ...arrivalBase, unloggedThisWeek: 3 }), '3 of the last 7 days unlogged — it\'s getting dusty in here')
  assert.equal(arrivalLine({ ...arrivalBase, oldestOpen: { compound: 'hCG', days: 28 } }), 'the hCG vial has been open 28 days — it checked the date')
  // Oct 23 → index 23 % 4 = 3 of the four everyday lines (no records).
  assert.equal(arrivalLine({ ...arrivalBase, ageDays: 509 }), 'day 509 together.')
  assert.equal(arrivalLine({ ...arrivalBase, today: '2026-10-21', streak: 7 }), '7 days in a row — it\'s keeping count.')
  assert.equal(arrivalLine({ ...arrivalBase, today: '2026-10-20' }), 'TICKER looks up expectantly.')
  assert.equal(helloLine('Sam'), 'a friend — Sam! TICKER waves. (it\'s Jim\'s; be gentle.)')
  assert.equal(helloLine(null), 'a friend! TICKER waves. (it\'s Jim\'s; be gentle.)')
})

test('the news since its last look: a broken streak first, at most three items, absence counted elsewhere', () => {
  const snap = { v: 1, date: '2026-10-15', streak: 10, loggedDays: 200, weight: 170, workouts: 50, scanDate: '2026-06-12', arms: 'lean', plannedIds: [1], activeCycleId: null }
  const now = {
    today: TODAY, streak: 2, loggedDays: 206, weight: 167.5, arms: 'built',
    scans: [{ date: '2026-06-12', total: { body_fat_pct: 20.2, lean_mass_lbs: 130 } }, { date: '2026-09-30', total: { body_fat_pct: 17.6, lean_mass_lbs: 143.9 } }],
    activeCycle: { id: 7, name: 'Primo', start_date: '2026-10-12', planned_weeks: 8, compounds: [] },
    planned: [{ id: 1, date: '2026-10-01', lab: 'Quest', panel: null, fasting: true }, { id: 2, date: '2026-11-01', lab: 'CHW', panel: 'CBC', fasting: false }],
    workouts: [{ date: '2026-10-16', duration_min: 30 }, { date: '2026-10-20', duration_min: 45.4 }, ...Array.from({ length: 50 }, () => ({ date: '2026-01-01', duration_min: 10 }))]
  }
  const news = newsSince(snap, now)
  assert.equal(news.length, 3, 'capped at three')
  assert.deepEqual(news[0], { line: 'the 10-day streak broke while it wasn\'t looking. 2 now — it\'ll count again.', pose: 'worried' })
  assert.deepEqual(news[1], { line: 'new scan Sep 30: body fat 17.6% (20.2% before), lean +13.9 lb. …and the arms filled in.', event: 'celebrate', pose: undefined })
  assert.deepEqual(news[2], { line: 'the Primo cycle is under way — week 2 of 8.', event: 'celebrate' })
  const quiet = newsSince({ ...snap, streak: 2, scanDate: '2026-09-30', activeCycleId: 7, arms: 'built' }, now)
  assert.deepEqual(quiet.map(n => n.line), [
    'a draw\'s been booked — CHW · CBC · non-fasting, in 9 days. it marked the calendar.',
    '2 workouts since its last look — 75 min. WALK walks it off.',
    'down 2.5 lb since its last look — 170 → 167.5.'
  ])
  const fewer = newsSince({ ...snap, streak: 2, scanDate: '2026-09-30', activeCycleId: 7, arms: 'built', plannedIds: [1, 2], workouts: 52, weight: 167 }, now)
  assert.deepEqual(fewer.map(n => n.line), ['6 days logged since its last look — 2 in a row now.'])
  assert.equal(fewer[0].event, 'celebrate')
})

test('footprints: who came by since the owner last looked', () => {
  const visits = { total: 5, pets: 3, recent: [{ date: TODAY, role: 'friend', label: 'Sam', pets: 2, best_run: null, bests: {} }, { date: '2026-10-22', role: 'friend', label: null, pets: 0, best_run: null, bests: {} }], best: null, bests: {} }
  assert.deepEqual(visitorsNews(visits, 3), { line: '2 visits since its last look — Sam, a friend. 2 pets given. it waved.', event: 'celebrate' })
  assert.equal(visitorsNews(visits, 5), null)
  assert.equal(visitorsNews(null, 0), null)
})

test('the one-shots\' lines', () => {
  assert.equal(flinchLine(1), 'one soda. it noticed.')
  assert.equal(flinchLine(2), 'two sodas. it winced.')
  assert.equal(flinchLine(3), 'three sodas. it remembers.')
  assert.equal(flinchLine(5), '5 sodas. it remembers.')
  assert.equal(squeakFor(1, false), '♥!')
  assert.equal(squeakFor(99, false), '(happy wiggle)')
  assert.equal(squeakFor(1, true), '(it stirs, smiles… and goes back to sleep)')
  assert.equal(plateLine({ doses: 3, fed: 1, rulesApply: true, missing: 0, missingNames: '' }), '2 more on the plate.')
  assert.equal(plateLine({ doses: 3, fed: 3, rulesApply: true, missing: 1, missingNames: 'HGH' }), 'plate clear. still waiting on HGH.')
  assert.equal(plateLine({ doses: 1, fed: 1, rulesApply: false, missing: 1, missingNames: 'HGH' }), 'all 1 dose down. ♥')
  assert.equal(doseStartLine('HGH 2 IU', true, ' (yesterday\'s plate)'), 'HGH 2 IU — jab… (yesterday\'s plate)')
  assert.equal(doseDoneLine('HGH 2 IU', 'HGH', true, false), 'HGH 2 IU — in. the small one. barely a pinch.')
  assert.equal(doseDoneLine('X 1 mg', 'X', true, true), 'X 1 mg — in. still didn\'t flinch.')
  assert.equal(doseDoneLine('Iron 25 mg', 'Iron', false, false), 'Iron 25 mg — swallowed. with water, like a grown-up.')
  assert.equal(doseDoneLine('Tadalafil 5 mg tablet', 'Tadalafil', false, false), 'Tadalafil 5 mg tablet — swallowed. the little yellow one. for the pipes.')
  assert.equal(walkStartLine(48, 112, true), 'walking off 48 min of workouts at 112 bpm (yesterday\'s)…')
  assert.equal(walkEndLine(48), '48 minutes — a proper outing. ♥')
  assert.equal(walkEndLine(20), '20 minutes walked together.')
})

test('the games: the intro by game, the quit remark by what the run earned', () => {
  const wall = { cans: [{ oz: 12, week: 0 }], count: 1, title: 'X', practice: true }
  assert.equal(playIntroLine('runner', wall), 'space or tap to run. esc quits.')
  assert.equal(playIntroLine('crusher', wall), '1 cans on the wall (last month\'s — this one is clean). space or tap to launch; arrows or the pointer move. esc quits.')
  assert.equal(playIntroLine('crusher', { ...wall, count: 0 }), 'nothing to shoot. good. (esc quits)')
  const base = { game: 'runner', score: 120, best: { score: 300, date: '2026-10-01' }, house: 300, keeper: true, setRecord: false, beatHouse: false, cleared: false, wallEmpty: false }
  assert.deepEqual(quitRemark(base), { line: '120 points. best 300 on Oct 1 — it\'s still catching its breath.', event: null, hearts: false })
  assert.deepEqual(quitRemark({ ...base, setRecord: true, best: { score: 120, date: TODAY } }), { line: 'new best: 120 points. ♥', event: 'celebrate', hearts: true })
  assert.deepEqual(quitRemark({ ...base, keeper: false, beatHouse: true }), { line: 'new house record: 120 points. ♥', event: 'celebrate', hearts: true })
  assert.deepEqual(quitRemark({ ...base, keeper: false, setRecord: true }), { line: '120 points — your best yet. the house record is 300.', event: 'bigbeat', hearts: false })
  assert.deepEqual(quitRemark({ ...base, game: 'crusher', cleared: true }), { line: 'wall cleared. 120 points. ♥', event: 'celebrate', hearts: false })
  assert.deepEqual(quitRemark({ ...base, keeper: false, best: null }), { line: '120 points. the house record is 300.', event: null, hearts: false })
  assert.deepEqual(quitRemark({ ...base, score: 0, game: 'crusher', wallEmpty: true }), { line: 'nothing to shoot. good.', event: null, hearts: false })
  assert.deepEqual(quitRemark({ ...base, score: 0 }), { line: 'next time.', event: null, hearts: false })
  const summary = { cleared: false, crushed: 0, cansCrushed: 0, hits: [{ day: 13, by: 'can' }, { day: 13, by: 'can' }, { day: 13, by: 'pit' }], worstDay: { day: 13, date: '2026-09-14', by: ['can', 'pit'] } }
  assert.equal(gotLine(summary), 'sep 14 got me — two cans and the pit.')
  assert.equal(gotLine({ ...summary, hits: [], worstDay: null, cleared: true }), 'not a scratch.')
  assert.equal(gotLine({ ...summary, hits: [], worstDay: null }), '')
})

test('the stats tiles and the day summary', () => {
  assert.deepEqual(drawTile(null), { value: '—', hint: 'nothing booked' })
  assert.deepEqual(drawTile({ status: 'today', inDays: 0, plan: { lab: 'Quest', fasting: true, date: TODAY } }), { value: 'today', hint: 'Quest · fasting' })
  assert.deepEqual(drawTile({ status: 'overdue', inDays: -3, plan: { lab: null, fasting: false, date: '2026-10-20' } }), { value: '3d late', hint: 'draw · nothing on file' })
  assert.deepEqual(drawTile({ status: 'upcoming', inDays: 9, plan: { lab: 'CHW', fasting: false, date: '2026-11-01' } }), { value: '9d', hint: 'CHW · Nov 1' })
  assert.deepEqual(fedTile({ rulesApply: false, doses: 2, due: 0, logged: 0, missing: 0, eaten: 0, missingNames: '', hunger: 'fed' }), { value: 'fed', hint: '2 logged' })
  assert.deepEqual(fedTile({ rulesApply: true, doses: 0, due: 0, logged: 0, missing: 0, eaten: 0, missingNames: '', hunger: 'rest' }), { value: 'rest day', hint: 'nothing due' })
  assert.deepEqual(fedTile({ rulesApply: true, doses: 1, due: 2, logged: 1, missing: 1, eaten: 1, missingNames: 'HGH', hunger: 'hungry' }), { value: '1/2', hint: 'hungry · 1 to come', title: 'still to log: HGH' })
  const tiles = statTiles({
    ageDays: 1234, birthday: null, firstDate: '2023-06-06', weight: 169.8, streak: 14,
    fed: { value: '2/2', hint: 'all down', title: undefined }, draw: { value: '9d', hint: 'CHW · Nov 1' },
    moodWord: 'steady', fever: null, recovery: 72, petsToday: 3, petsTotal: 1200, visitorPets: 4
  })
  assert.deepEqual(tiles.map(t => [t.label, t.value]), [['AGE', '1,234d'], ['WEIGHT', '169.8 lb'], ['STREAK', '14d'], ['FED', '2/2'], ['NEXT DRAW', '9d'], ['MOOD', 'steady'], ['PETS', '3']])
  assert.equal(tiles[0].title, 'days since the first logged day, Jun 6 2023')
  assert.equal(tiles[5].hint, 'recovery 72%')
  assert.equal(tiles[6].hint, '1,200 all-time')
  assert.equal(tiles[6].title, '4 of them from visitors')
  assert.equal(todaySummaryLine({ doses: 2, rulesApply: true, due: 2, missing: 1, eaten: 1, missingNames: 'HGH', workoutMinutes: 0, sodasToday: 1 }), '1 of 2 due doses down (HGH to come), no walk yet, 1 soda (it noticed).')
  assert.equal(todaySummaryLine({ doses: 0, rulesApply: false, due: 0, missing: 0, eaten: 0, missingNames: '', workoutMinutes: 48, sodasToday: 0 }), 'nothing served yet, 48 min walked, no sodas (it approves).')
})
