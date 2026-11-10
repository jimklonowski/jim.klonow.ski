// The isotretinoin course page's arithmetic (shared/utils/accutane.ts). Same plain node:test +
// native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COURSE_MARKERS, STALE_PHOTO_DAYS, baselineDrawDate, courseCaveatSpans, courseDoses, courseLabs, courseLadder, courseStats,
  donationDeferral, isotretinoinCycle, photoStrip, plannedMgPerDay, recheckDraw, signalSummary, weeklySeries
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
  assert.equal(isotretinoinCycle([{ ...course, start_precision: 'quarter' }], '2026-11-20'), null, 'a tentative course has no dates to run on')
  assert.equal(plannedMgPerDay(course), 40)
  assert.equal(plannedMgPerDay({ ...course, compounds: [{ ...course.compounds[0], weekdays: [1, 3, 5] }] }), 17.14)
  assert.equal(plannedMgPerDay(blast), null)
})

test('donation is deferred from capsule one until 30 days after the last; a course ahead is announced, a tentative one defers nothing', () => {
  // 41 weeks from Nov 7 ends 2027-08-20; donation is fine again 30 days on, the ladder's own date.
  assert.deepEqual(donationDeferral([course], '2026-11-06'), { start: '2026-11-07', until: '2027-09-19', active: false })
  assert.equal(donationDeferral([course], '2026-11-07').active, true)
  assert.equal(donationDeferral([course], '2027-09-18').active, true, 'the last day of the month after')
  assert.equal(donationDeferral([course], '2027-09-19'), null, 'over, and nothing ahead')
  assert.equal(donationDeferral([blast], '2026-12-01'), null)
  assert.equal(donationDeferral([{ ...course, start_precision: 'month' }], '2026-12-01'), null, 'a tentative course has no dates')
  // Ended early: the month runs from the actual end.
  assert.equal(donationDeferral([{ ...course, actual_end: '2027-03-01' }], '2027-03-30').until, '2027-03-31')
  // Inside the first course's tail with a second already booked: the one covering the day wins.
  const second = { ...course, id: 9, start_date: '2027-12-01', planned_weeks: 20 }
  assert.deepEqual(donationDeferral([second, course], '2027-09-01'), { start: '2026-11-07', until: '2027-09-19', active: true })
  assert.equal(donationDeferral([second, course], '2027-10-01').start, '2027-12-01')
  assert.equal(donationDeferral([second, course], '2027-10-01').active, false)
})

test('the course stars the lipid markers from capsule one to a month past the end — from the cycle row and from the dose log alike', () => {
  const spans = courseCaveatSpans([course, blast], [dose('2026-11-07'), dose('2026-11-20')])
  assert.deepEqual(spans, [
    { compound: 'Isotretinoin', from: '2026-11-07', to: '2027-09-19' },
    { compound: 'Isotretinoin', from: '2026-11-07', to: '2026-12-20' }
  ])
  assert.deepEqual(courseCaveatSpans([{ ...course, start_precision: 'quarter' }], []), [], 'a tentative course and an empty log star nothing')
  // A course logged with no cycle row at all still stars its draws.
  assert.equal(courseCaveatSpans([], [dose('2026-11-07')]).length, 1)
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
  // 11595 / 40 = 289.9 → the 290th dosed day, capsule one being day one: start + 289.
  assert.equal(before.reachLower, '2027-08-23')
  // 17006 / 40 = 425.2 → the 426th day: start + 425.
  assert.equal(before.reachUpper, '2028-01-06')
  // A tiny target: 1 lb → 75 mg, two 40 mg days, so day two — start + 1, not start + 2.
  assert.equal(courseStats(course, [], 1, '2026-11-05', 40).reachLower, '2026-11-08')

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
  assert.equal(titrated.paceWindowDays, 4)

  // Item 98: the pace is the last two weeks' dose, not the course mean. Thirty days at 40 then
  // fourteen at 80: the mean would say 52.7 and date every target weeks late; the pace says 80.
  const stepped = []
  for (let i = 0; i < 44; i++) stepped.push(dose(new Date(Date.UTC(2026, 10, 7 + i)).toISOString().slice(0, 10), i < 30 ? 40 : 80))
  const onEighty = courseStats(course, courseDoses(stepped), 170.5, '2026-12-20', 40)
  assert.equal(onEighty.daysElapsed, 44)
  assert.equal(onEighty.cumulativeMg, 2320)
  assert.equal(onEighty.paceMgPerDay, 80)
  assert.equal(onEighty.paceWindowDays, 14)
  // (11595 − 2320) / 80 = 115.9 → 116 days after Dec 20.
  assert.equal(onEighty.reachLower, '2027-04-15')
  // A lapse inside the window lowers the pace: two skipped days in the last fourteen.
  const lapsed = courseStats(course, courseDoses(stepped.filter(d => !['2026-12-18', '2026-12-19'].includes(d.date))), 170.5, '2026-12-20', 40)
  assert.equal(lapsed.paceMgPerDay, 68.6)

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

  // After the last planned day: a capsule logged past it is not this course's, and there is no
  // projection left to make (item 92).
  const short = { ...course, planned_weeks: 1 }
  const over = courseStats(short, courseDoses(['07', '08', '09', '13', '14', '20'].map(d => dose(`2026-11-${d}`))), 170.5, '2026-11-25', 40)
  assert.equal(over.status, 'done')
  assert.equal(over.daysElapsed, 7)
  assert.equal(over.dosedDays, 4, 'Nov 13 is the last day and counts; Nov 14 and Nov 20 fall after it')
  assert.equal(over.cumulativeMg, 160)
  assert.equal(over.lastDoseDate, '2026-11-13')
  assert.equal(over.reachLower, null)
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
  // No baseline and no recheck on day two: a baseline can't be drawn any more, so it reads
  // missed (never "here") and "here" moves on to the recheck, which says what to book (item 91).
  const bare = courseLadder(stats, '2026-11-08', null, null)
  assert.equal(bare.find(r => r.key === 'baseline').state, 'missed')
  assert.match(bare.find(r => r.key === 'baseline').detail, /earliest reading now/)
  assert.equal(bare.find(r => r.key === 'recheck').state, 'here')
  assert.match(bare.find(r => r.key === 'recheck').detail, /book/)
  assert.equal(bare.filter(r => r.tier === 'course' && r.state === 'here').length, 1)
  // Before the start a missing baseline is still "here": there is time to draw one.
  const pre = courseLadder(courseStats(course, [], 170.5, '2026-11-01', 40), '2026-11-01', null, null)
  assert.equal(pre.find(r => r.key === 'baseline').state, 'here')
  assert.equal(pre.filter(r => r.tier === 'course' && r.state === 'here').length, 1)
  // Week 13 with no recheck at all: the window has gone by — missed, and "here" sits on 150 mg/kg.
  const late = courseLadder(stats, '2027-02-01', '2026-10-17', null)
  const byLate = Object.fromEntries(late.map(r => [r.key, r]))
  assert.equal(byLate.recheck.state, 'missed')
  assert.match(byLate.recheck.detail, /passed without/)
  assert.equal(byLate.lower.state, 'here')
  // A plan missed inside the window; a plan done by a draw without the course markers; an
  // overdue plan is still the live rung.
  assert.equal(courseLadder(stats, '2027-01-05', '2026-10-17', { date: '2026-12-15', onFile: false, planStatus: 'missed' }).find(r => r.key === 'recheck').state, 'missed')
  const noLipids = courseLadder(stats, '2027-01-05', '2026-10-17', { date: '2026-12-15', onFile: false, planStatus: 'done' }).find(r => r.key === 'recheck')
  assert.equal(noLipids.state, 'missed')
  assert.match(noLipids.detail, /no lipids or liver/)
  const overdue = courseLadder(stats, '2026-12-20', '2026-10-17', { date: '2026-12-15', onFile: false, planStatus: 'overdue' }).find(r => r.key === 'recheck')
  assert.equal(overdue.state, 'here')
  assert.match(overdue.detail, /overdue/)
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
  // With the course's end given, a later draw is recovery and stays out of the on-course column.
  const ended = courseLabs(labs, '2026-11-07', '2027-01-15').find(r => r.key === 'triglycerides')
  assert.deepEqual(ended.latest, { date: '2026-12-15', value: 140 })
  assert.equal(ended.onCourse.length, 1)
  assert.equal(ended.delta, 69)
})

test('the first recheck is a draw WITH the course markers inside weeks 3–10, else the earliest open plan, else a failed plan to report', () => {
  const lipids = date => ({ date, markers: { triglycerides: 100, ldl: 110 } })
  const hormones = date => ({ date, markers: { testosterone_total: 800, estradiol: 30 } })
  const plan = (date, status = 'upcoming') => ({ date, status })
  assert.equal(recheckDraw([], [], '2026-11-07'), null)
  assert.deepEqual(recheckDraw([], [plan('2026-12-15'), plan('2026-12-01')], '2026-11-07'), { date: '2026-12-01', onFile: false, planStatus: 'upcoming' })
  assert.deepEqual(recheckDraw([lipids('2026-10-17'), lipids('2026-12-20')], [plan('2026-12-15')], '2026-11-07'), { date: '2026-12-20', onFile: true })
  assert.equal(recheckDraw([lipids('2026-11-10')], [], '2026-11-07'), null, 'day three is too early to be the recheck')
  // Item 90: a hormone-only panel or an echo inside the window is not the recheck.
  assert.deepEqual(recheckDraw([hormones('2026-12-10')], [plan('2026-12-15')], '2026-11-07'), { date: '2026-12-15', onFile: false, planStatus: 'upcoming' })
  assert.equal(recheckDraw([hormones('2026-12-10'), { date: '2026-12-12', markers: {} }], [], '2026-11-07'), null)
  // An open plan beats a missed one; a lone failed plan is handed back so the ladder can say so.
  assert.deepEqual(recheckDraw([], [plan('2026-12-01', 'missed'), plan('2027-01-10', 'overdue')], '2026-11-07'), { date: '2027-01-10', onFile: false, planStatus: 'overdue' })
  assert.deepEqual(recheckDraw([], [plan('2026-12-01', 'missed')], '2026-11-07'), { date: '2026-12-01', onFile: false, planStatus: 'missed' })
  assert.deepEqual(recheckDraw([hormones('2026-12-01')], [plan('2026-12-01', 'done')], '2026-11-07'), { date: '2026-12-01', onFile: false, planStatus: 'done' })
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

  // Counts sum; before the start there is no week 0 and no mark. Week −1 still has a day to run,
  // so its count is partial.
  const workouts = weeklySeries([{ date: '2026-10-31', value: 1 }, { date: '2026-11-02', value: 1 }], start, '2026-11-05', 'sum')
  assert.equal(workouts.at(-1).index, -1)
  assert.equal(workouts.at(-1).value, 2)
  assert.equal(workouts.at(-1).partial, true)
  const ws = signalSummary(workouts)
  assert.equal(ws.markIndex, null)
  assert.equal(ws.current, null)
  assert.deepEqual(signalSummary(weeklySeries([], start, '2026-11-22')).values, [])
  assert.ok(weeks.every(w => !w.partial), 'a mean is a level: never partial')

  // Item 94: on a Wednesday the running week's one session is not "current" — the last complete
  // week is, and the sparkline stops there too.
  const sessions = ['2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-07', '2026-11-09', '2026-11-11', '2026-11-15']
    .map(date => ({ date, value: 1 }))
  const wk = weeklySeries(sessions, start, '2026-11-18', 'sum')
  assert.deepEqual(wk.slice(-3).map(w => [w.index, w.value, w.partial]), [[-1, 2, false], [0, 3, false], [1, 1, true]])
  const sum = signalSummary(wk)
  assert.equal(sum.current, 3, 'week 0, the last complete week')
  assert.equal(sum.baseline, 2.5, 'weeks −2 and −1')
  assert.equal(sum.delta, 0.5)
  assert.equal(sum.values.length, wk.length - 1, 'the running week is not drawn')
  assert.equal(sum.markIndex, 8)
  // Sunday, the week's last day: complete, so it counts.
  assert.equal(weeklySeries(sessions, start, '2026-11-20', 'sum').at(-1).partial, false)
})
