// The isotretinoin course page's arithmetic (shared/utils/accutane.ts). Same plain node:test +
// native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COURSE_MARKERS, STALE_PHOTO_DAYS, baselineDrawDate, courseDoses, courseLabs, courseLadder, courseStats,
  isotretinoinCycle, photoStrip, plannedMgPerDay, recheckDraw, signalSummary, weeklySeries
} from '../shared/utils/accutane.ts'

const course = {
  id: 4,
  name: 'Isotretinoin Course',
  start_date: '2026-11-07',
  planned_weeks: 41,
  compounds: [{ compound: 'Isotretinoin', dose: 40, unit: 'mg', weekdays: [0, 1, 2, 3, 4, 5, 6], fromWeek: 1, toWeek: 41 }]
}
const blast = {
  id: 1,
  name: 'Primo',
  start_date: '2027-07-01',
  planned_weeks: 16,
  compounds: [{ compound: 'Methenolone Enanthate', dose: 100, unit: 'mg', weekdays: [1, 4], fromWeek: 1, toWeek: 16 }]
}

const dose = (date, mg = 40) => ({ date, peptides: [{ time: '07:00', compound: 'Isotretinoin', dose: mg, unit: 'mg' }] })

test('the course is the cycle carrying isotretinoin: active, else soonest upcoming, else latest done', () => {
  assert.equal(isotretinoinCycle([blast], '2026-11-20'), null)
  assert.equal(isotretinoinCycle([blast, course], '2026-11-20')?.id, 4)
  assert.equal(isotretinoinCycle([course], '2026-11-01')?.id, 4, 'upcoming still counts')
  const later = { ...course, id: 9, start_date: '2028-01-01' }
  assert.equal(isotretinoinCycle([later, course], '2026-11-20')?.id, 4, 'the active one beats a later plan')
  assert.equal(isotretinoinCycle([later, course], '2027-12-01')?.id, 9, 'after the first ends, the upcoming one')
  assert.equal(plannedMgPerDay(course), 40)
  assert.equal(plannedMgPerDay({ ...course, compounds: [{ ...course.compounds[0], weekdays: [1, 3, 5] }] }), 17.14)
  assert.equal(plannedMgPerDay(blast), null)
})

test('the dose log is the ledger: per-day milligrams, mcg folded, other compounds ignored', () => {
  const entries = [
    { date: '2026-11-08', peptides: [{ compound: 'HGH', dose: 2.5, unit: 'iu' }, { compound: 'Isotretinoin', dose: 20, unit: 'mg' }, { compound: 'Isotretinoin', dose: 20, unit: 'mg' }] },
    dose('2026-11-07'),
    { date: '2026-11-09', peptides: [{ compound: 'Isotretinoin', dose: 40000, unit: 'mcg' }] },
    { date: '2026-11-10', peptides: [] },
    { date: '2026-11-11' }
  ]
  assert.deepEqual(courseDoses(entries), [
    { date: '2026-11-07', mg: 40 }, { date: '2026-11-08', mg: 40 }, { date: '2026-11-09', mg: 40 }
  ])
})

test('cumulative, mg/kg, pace and the projected target days follow the log, not the plan', () => {
  // Before the start: nothing logged, the projection runs on the plan from day one.
  const before = courseStats(course, [], 170.5, '2026-11-05', 40)
  assert.equal(before.status, 'upcoming')
  assert.equal(before.daysElapsed, 0)
  assert.equal(before.kg, 77.3)
  assert.equal(before.lowerMg, 11595)
  assert.equal(before.upperMg, 17006)
  assert.equal(before.paceMgPerDay, 40)
  // 11595 / 40 = 289.9 → 290 days from the start.
  assert.equal(before.reachLower, '2027-08-24')
  // 17006 / 40 = 425.2 → 426 days.
  assert.equal(before.reachUpper, '2028-01-07')

  // Ten days in, two missed: cumulative is what was taken; the pace is the logged mean.
  const log = courseDoses(['07', '08', '09', '10', '11', '14', '15', '16'].map(d => dose(`2026-11-${d}`)))
  const ten = courseStats(course, log, 170.5, '2026-11-16', 40)
  assert.equal(ten.status, 'active')
  assert.equal(ten.daysElapsed, 10)
  assert.equal(ten.dosedDays, 8)
  assert.equal(ten.cumulativeMg, 320)
  assert.equal(ten.mgPerKg, 4.1)
  assert.equal(ten.pctOfLower, 2.8)
  assert.equal(ten.paceMgPerDay, 32)
  assert.equal(ten.currentMgPerDay, 40)
  assert.equal(ten.lastDoseDate, '2026-11-16')
  // (11595 − 320) / 32 = 352.3 → 353 days after today.
  assert.equal(ten.reachLower, '2027-11-04')

  // A titration shows in the current dose and shortens the projection.
  const up = courseDoses([...['07', '08', '09'].map(d => dose(`2026-11-${d}`)), dose('2026-11-10', 80)])
  const titrated = courseStats(course, up, 170.5, '2026-11-10', 40)
  assert.equal(titrated.currentMgPerDay, 80)
  assert.equal(titrated.cumulativeMg, 200)
  assert.equal(titrated.paceMgPerDay, 50)

  // A target already reached is dated by the day the running total crossed it.
  const heavy = Array.from({ length: 300 }, (_, i) => ({ date: `2027-0${1 + Math.floor(i / 100)}-${String((i % 100) + 1).padStart(2, '0')}`, mg: 40 }))
    .filter(d => Number(d.date.slice(8)) <= 28)
  const small = { ...course, start_date: '2027-01-01' }
  const crossed = courseStats(small, heavy, 40, '2027-03-28', 40) // 18.1 kg → lower 2715 mg → day 68
  assert.equal(crossed.lowerMg, 2715)
  assert.equal(crossed.reachLower, '2027-03-12', 'the 68th logged 40 mg day (28+28+12)')

  // No weight on the log: milligrams still count, the per-kg side waits.
  const noWeight = courseStats(course, log, null, '2026-11-16', 40)
  assert.equal(noWeight.kg, null)
  assert.equal(noWeight.reachLower, null)
  assert.equal(noWeight.cumulativeMg, 320)
})

test('the ladder has a course tier dated by the data and a typical tier pinned to the calendar', () => {
  const stats = courseStats(course, courseDoses([dose('2026-11-07'), dose('2026-11-08')]), 170.5, '2026-11-08', 40)
  const rungs = courseLadder(stats, '2026-11-08', '2026-10-17', { date: '2026-12-15', onFile: false })
  const by = Object.fromEntries(rungs.map(r => [r.key, r]))
  assert.equal(by.baseline.state, 'done')
  assert.equal(by.baseline.date, '2026-10-17')
  assert.equal(by.start.state, 'done')
  assert.equal(by.recheck.state, 'here', 'the first undone course rung is "here"')
  assert.equal(by.recheck.date, '2026-12-15')
  assert.equal(by.lower.state, 'upcoming')
  assert.ok(by.lower.date > '2027-01-01')
  assert.equal(by.end.date, '2027-08-20')
  assert.equal(by.donation.date, '2027-09-19')
  assert.equal(by.procedures.date, '2028-02-16')
  assert.equal(rungs.filter(r => r.tier === 'course' && r.state === 'here').length, 1)
  // Typical tier, day two: steady state is the live window, the rest ahead.
  assert.equal(by.steady.state, 'here')
  assert.equal(by.flare.state, 'upcoming')
  assert.equal(by.flare.date, '2026-11-14')
  assert.match(by.flare.label, /wk 2–6/)
  // Week nine: steady/flare/labs are behind, improvement is live.
  const later = courseLadder(stats, '2027-01-05', '2026-10-17', { date: '2026-12-15', onFile: true })
  const byL = Object.fromEntries(later.map(r => [r.key, r]))
  assert.equal(byL.recheck.state, 'done')
  assert.equal(byL.labs.state, 'done')
  assert.equal(byL.improve.state, 'here')
  // No baseline and no recheck: the rungs say what to do rather than vanish.
  const bare = courseLadder(stats, '2026-11-08', null, null)
  assert.equal(bare.find(r => r.key === 'baseline').state, 'here')
  assert.match(bare.find(r => r.key === 'recheck').detail, /book/)
})

test('the labs panel diffs each marker against the latest pre-course reading inside the lookback', () => {
  const labs = [
    { date: '2026-05-01', markers: { triglycerides: 60, ldl: 90 } }, // too old to be the baseline
    { date: '2026-10-17', markers: { triglycerides: 71, ldl: 102, hdl: 48, alt: 22, ast: 19 } },
    { date: '2026-12-15', markers: { triglycerides: 140, ldl: 130, hdl: 41, alt: 35, ast: 24, ck: 420 } },
    { date: '2027-02-01', markers: { triglycerides: 120, hdl: 44 } }
  ]
  const rows = courseLabs(labs, '2026-11-07')
  assert.deepEqual(rows.map(r => r.key), [...COURSE_MARKERS])
  const tg = rows.find(r => r.key === 'triglycerides')
  assert.deepEqual(tg.baseline, { date: '2026-10-17', value: 71 })
  assert.deepEqual(tg.latest, { date: '2027-02-01', value: 120 })
  assert.equal(tg.delta, 49)
  assert.equal(tg.asExpected, true)
  assert.equal(tg.onCourse.length, 2)
  const hdl = rows.find(r => r.key === 'hdl')
  assert.equal(hdl.delta, -4)
  assert.equal(hdl.asExpected, true, 'HDL falling is the drug effect')
  const ck = rows.find(r => r.key === 'ck')
  assert.equal(ck.baseline, null)
  assert.equal(ck.latest.value, 420)
  assert.equal(ck.delta, null)
  assert.equal(ck.asExpected, null)
  assert.equal(baselineDrawDate(labs, '2026-11-07'), '2026-10-17')
  assert.equal(baselineDrawDate(labs, '2027-06-01'), null, 'an on-course draw is nobody\'s baseline')
})

test('the first recheck is a draw on file inside weeks 3–10, else the earliest planned one', () => {
  assert.equal(recheckDraw([], [], '2026-11-07'), null)
  assert.deepEqual(recheckDraw([], ['2026-12-15', '2026-12-01'], '2026-11-07'), { date: '2026-12-01', onFile: false })
  assert.deepEqual(recheckDraw(['2026-10-17', '2026-12-20'], ['2026-12-15'], '2026-11-07'), { date: '2026-12-20', onFile: true })
  assert.equal(recheckDraw(['2026-11-10'], [], '2026-11-07'), null, 'day three is too early to be the recheck')
})

test('the photo strip knows each region\'s newest shot and when the last session was', () => {
  const photos = [
    { id: 1, date: '2026-11-07', category: 'chest' },
    { id: 2, date: '2026-11-21', category: 'chest' },
    { id: 3, date: '2026-11-07', category: 'face_left' },
    { id: 4, date: '2026-11-21', category: 'left_bicep' } // not in the set
  ]
  const strip = photoStrip(photos, ['chest', 'face', 'face_left'], '2026-11-30')
  assert.equal(strip.regions[0].latest.id, 2)
  assert.equal(strip.regions[0].count, 2)
  assert.equal(strip.regions[0].daysAgo, 9)
  assert.equal(strip.regions[0].stale, false)
  assert.equal(strip.regions[1].latest, null)
  assert.equal(strip.regions[1].stale, true)
  assert.equal(strip.regions[2].daysAgo, 23)
  assert.equal(strip.regions[2].stale, true)
  assert.equal(strip.lastSession, '2026-11-21')
  assert.equal(strip.daysSince, 9)
  assert.equal(strip.stale, false)
  const old = photoStrip(photos, ['chest'], `2026-12-${String(21 + STALE_PHOTO_DAYS - 30 + 1).padStart(2, '0')}`)
  assert.equal(old.stale, true, 'one day past the stale line')
  assert.equal(photoStrip([], ['chest'], '2026-11-30').lastSession, null)

  // The course's record starts in the baseline days before capsule one: a physique session the
  // week before is not its first frame, the set shot the day before is.
  const library = [
    { id: 1, date: '2026-11-02', category: 'chest' }, // physique session, five days before
    { id: 2, date: '2026-11-06', category: 'chest' }, // baseline set, the day before
    { id: 3, date: '2026-11-02', category: 'face' }
  ]
  const fromBaseline = photoStrip(library, ['chest', 'face'], '2026-11-07', '2026-11-04')
  assert.equal(fromBaseline.regions[0].latest.id, 2)
  assert.equal(fromBaseline.regions[0].count, 1)
  assert.equal(fromBaseline.regions[1].latest, null, 'the Nov 2 face shot is not in the course')
  assert.equal(fromBaseline.lastSession, '2026-11-06')
  assert.equal(photoStrip(library, ['chest'], '2026-11-07', null).regions[0].count, 2, 'null = the whole library')
})

test('a stream folds into course-relative weeks with a baseline band, and the summary carries gaps', () => {
  const start = '2026-11-07'
  const points = [
    { date: '2026-09-15', value: 170 }, // week -8 (Sep 12–18)
    { date: '2026-10-31', value: 172 }, // week -1
    { date: '2026-11-01', value: 174 }, // week -1
    { date: '2026-11-07', value: 171 }, // week 0
    { date: '2026-11-15', value: null }, // ignored
    { date: '2026-11-21', value: 169 } // week 2
  ]
  const weeks = weeklySeries(points, start, '2026-11-22')
  assert.equal(weeks.length, 11, 'eight before plus weeks 0, 1, 2')
  assert.equal(weeks[0].index, -8)
  assert.equal(weeks[0].from, '2026-09-12')
  assert.equal(weeks[0].value, 170)
  assert.equal(weeks[7].index, -1)
  assert.equal(weeks[7].value, 173)
  assert.equal(weeks[8].index, 0)
  assert.equal(weeks[8].value, 171)
  assert.equal(weeks[9].value, null, 'no data is null, never zero')
  assert.equal(weeks[10].value, 169)
  const s = signalSummary(weeks)
  assert.equal(s.baseline, 171.5)
  assert.equal(s.current, 169)
  assert.equal(s.delta, -2.5)
  assert.equal(s.markIndex, 8)
  assert.deepEqual(s.values, [170, 170, 170, 170, 170, 170, 170, 173, 171, 171, 169])

  // Counts sum; before the start there is no week 0 and no mark.
  const workouts = weeklySeries([{ date: '2026-10-31', value: 1 }, { date: '2026-11-02', value: 1 }], start, '2026-11-05', 'sum')
  assert.equal(workouts.at(-1).index, -1)
  assert.equal(workouts.at(-1).value, 2)
  const ws = signalSummary(workouts)
  assert.equal(ws.markIndex, null)
  assert.equal(ws.current, null)
  assert.deepEqual(signalSummary(weeklySeries([], start, '2026-11-22')).values, [])
})
