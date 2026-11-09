// The calendar feed (shared/utils/calendarFeed.ts) — audit #43 item 58: which dated things
// become events, with what titles and alarms, and that the iCalendar text is well formed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calendarEvents, escapeIcsText, foldIcsLine, renderIcs } from '../shared/utils/calendarFeed.ts'

const TODAY = '2026-11-09'
const plan = (id, date, over = {}) => ({ id, date, lab: 'Quest', panel: 'CBC + lipids', fasting: true, purpose: 'Is Hct under 52?\nLipids on the course', cycle_id: null, checkpoint_key: null, labs_date: null, created_at: '2026-11-01T00:00:00Z', ...over })
const lipids = date => ({ date, markers: { triglycerides: 90, ldl: 100, hematocrit: 50.1 } })
const course = {
  id: 4, name: 'Isotretinoin Course', start_date: '2026-11-07', start_precision: 'day', planned_weeks: 41, planned_days: null, actual_end: null,
  compounds: [{ compound: 'Isotretinoin', dose: 40, unit: 'mg', weekdays: [0, 1, 2, 3, 4, 5, 6], fromWeek: 1, toWeek: 41 }]
}
const primo = {
  id: 7, name: 'Primo spring', start_date: '2027-04-05', start_precision: 'day', planned_weeks: 16, planned_days: null, actual_end: null,
  compounds: [{ compound: 'Methenolone Enanthate', dose: 100, unit: 'mg', weekdays: [1, 4], fromWeek: 1, toWeek: 16 }]
}
const empty = { plans: [], labs: [], cycles: [], vaccinations: [], phlebotomies: [], journal: [] }
const byUid = events => Object.fromEntries(events.map(e => [e.uid, e]))

test('a planned draw: a generic all-day event with the evening-before alarm, and its prep days ahead of it', () => {
  const events = calendarEvents({ ...empty, plans: [plan(1, '2026-12-15')] }, TODAY, 'x.test')
  const by = byUid(events)
  const draw = by['draw-1@x.test']
  assert.equal(draw.summary, 'Lab draw', 'no lab or panel in the title')
  assert.equal(draw.start, '2026-12-15')
  assert.match(draw.description, /^Quest · CBC \+ lipids · fasting\n/)
  assert.match(draw.description, /Is Hct under 52\?\nLipids on the course/)
  assert.match(draw.description, /orals and supplements after the draw/, 'the day-of reminders fold into the draw')
  assert.equal(draw.alarm.trigger, '-PT4H')
  assert.match(draw.alarm.text, /fast from 20:00/)
  // Biotin three days out; training and the fast the day before, folded into one event.
  assert.equal(by['draw-prep-1-2026-12-12@x.test'].summary, 'Draw prep: hold biotin')
  const eve = by['draw-prep-1-2026-12-14@x.test']
  assert.equal(eve.summary, 'Draw prep: no hard training · fast from 20:00')
  assert.equal(eve.alarm.trigger, 'PT9H')
  assert.equal(events.length, 3)
  // Non-fasting: no fast anywhere.
  const dry = calendarEvents({ ...empty, plans: [plan(2, '2026-12-15', { fasting: false })] }, TODAY, 'x.test')
  assert.ok(dry.every(e => !/fast/.test(e.summary) && !/fast/.test(e.alarm?.text ?? '')))
  assert.equal(dry.find(e => e.uid.startsWith('draw-2')).alarm.text, 'Lab draw tomorrow: no hard training')
})

test('draws already fulfilled or long missed drop out; one past its date stays, marked, without an alarm; a prep day already gone is not re-listed', () => {
  const events = calendarEvents({
    ...empty,
    plans: [plan(1, '2026-10-17', { labs_date: '2026-10-17' }), plan(2, '2026-09-01'), plan(3, '2026-11-02'), plan(4, '2026-11-10')],
    labs: [lipids('2026-10-17')]
  }, TODAY, 'x.test')
  const uids = events.map(e => e.uid)
  assert.ok(!uids.includes('draw-1@x.test'), 'done')
  assert.ok(!uids.includes('draw-2@x.test'), 'missed')
  const overdue = events.find(e => e.uid === 'draw-3@x.test')
  assert.equal(overdue.summary, 'Lab draw (no results yet)')
  assert.equal(overdue.alarm, undefined)
  assert.ok(!uids.some(u => u.startsWith('draw-prep-3-')), 'its prep days are gone')
  // Tomorrow's draw: today is its eve, so today's prep still lists; the biotin day (Nov 7) is past.
  assert.ok(uids.includes('draw-prep-4-2026-11-09@x.test'))
  assert.ok(!uids.includes('draw-prep-4-2026-11-07@x.test'))
})

test('a cycle: start, end and its open checkpoint windows; a tentative plan dates nothing', () => {
  const events = calendarEvents({ ...empty, cycles: [primo] }, TODAY, 'x.test')
  const by = byUid(events)
  assert.deepEqual([by['cycle-start-7@x.test'].start, by['cycle-start-7@x.test'].summary, by['cycle-start-7@x.test'].description], ['2027-04-05', 'Cycle starts', 'Primo spring'])
  assert.equal(by['cycle-end-7@x.test'].start, '2027-07-25')
  const baseline = by['cycle-cp-7-baseline@x.test']
  assert.equal(baseline.summary, 'Cycle checkpoint: baseline draw')
  assert.equal(baseline.start, '2027-01-05', '90 days before the start')
  assert.equal(baseline.end, '2027-04-07', 'exclusive end: the day after start + 1')
  assert.ok(by['cycle-cp-7-mid@x.test'] && by['cycle-cp-7-end@x.test'] && by['cycle-cp-7-recovery@x.test'])
  assert.equal(calendarEvents({ ...empty, cycles: [{ ...primo, start_precision: 'quarter' }] }, TODAY, 'x.test').length, 0)
  // A window already open starts today, not in the past.
  const soon = calendarEvents({ ...empty, cycles: [{ ...primo, start_date: '2026-12-01' }] }, TODAY, 'x.test')
  assert.equal(byUid(soon)['cycle-cp-7-baseline@x.test'].start, TODAY)
})

test('the course: its rungs as "Course: …" events, the unbooked recheck as a window, no compound name anywhere', () => {
  const journal = [{ date: '2026-11-07', weight_lbs: 170.5, peptides: [{ compound: 'Isotretinoin', dose: 40, unit: 'mg' }] }, { date: '2026-11-08', peptides: [{ compound: 'Isotretinoin', dose: 40, unit: 'mg' }] }]
  const events = calendarEvents({ ...empty, cycles: [course], labs: [lipids('2026-10-17')], journal }, TODAY, 'x.test')
  const by = byUid(events)
  assert.ok(!by['course-4-start@x.test'], 'capsule one is behind us')
  assert.equal(by['course-4-recheck-window@x.test'].summary, 'Course: first recheck window')
  assert.deepEqual([by['course-4-recheck-window@x.test'].start, by['course-4-recheck-window@x.test'].end], ['2026-11-21', '2027-01-17'])
  assert.equal(by['course-4-lower@x.test'].summary, 'Course: lower target reached (projected)')
  assert.match(by['course-4-lower@x.test'].description, /150 mg\/kg: 11,595 mg/)
  assert.equal(by['course-4-end@x.test'].start, '2027-08-20')
  assert.equal(by['course-4-donation@x.test'].start, '2027-09-19')
  assert.equal(by['course-4-procedures@x.test'].start, '2028-02-16')
  assert.ok(events.every(e => !/isotretinoin|accutane/i.test(e.summary)), 'generic titles')
  // The course's cycle row adds no "Cycle starts/ends" of its own, but its checkpoints still list.
  assert.ok(!by['cycle-start-4@x.test'] && !by['cycle-end-4@x.test'])
  assert.ok(by['cycle-cp-4-end@x.test'])
  // With a recheck booked, the planned draw is the event and the window is not drawn.
  const booked = calendarEvents({ ...empty, cycles: [course], labs: [lipids('2026-10-17')], journal, plans: [plan(9, '2026-12-15', { cycle_id: 4 })] }, TODAY, 'x.test')
  assert.ok(!byUid(booked)['course-4-recheck-window@x.test'])
  assert.ok(byUid(booked)['draw-9@x.test'])
})

test('boosters due ahead and the CBC six weeks after a phlebotomy, dropped once a CBC is on file', () => {
  const vaccinations = [
    { id: 1, date: '2017-05-01', vaccine: 'Tdap', product: null, notes: null },
    { id: 2, date: '2026-10-01', vaccine: 'Influenza', product: 'Fluzone', notes: null }
  ]
  const phlebotomies = [{ id: 1, date: '2026-10-20', kind: 'therapeutic', ml: 450, pre_hgb: null, notes: null, created_at: 'x' }]
  const events = calendarEvents({ ...empty, vaccinations, phlebotomies }, TODAY, 'x.test')
  const by = byUid(events)
  // The UID is the booster FAMILY (Td and Tdap share the tetanus clock), the label the catalogue name.
  assert.equal(by['booster-tetanus@x.test'].start, '2027-05-01')
  assert.equal(by['booster-tetanus@x.test'].summary, 'Booster due')
  assert.match(by['booster-tetanus@x.test'].description, /^Tetanus \(Td\/Tdap\) — last dose 2017-05-01, every 10 years/)
  assert.equal(by['booster-influenza@x.test'].start, '2027-10-01')
  const cbc = by['phleb-retest-1@x.test']
  assert.equal(cbc.start, '2026-12-01')
  assert.equal(cbc.summary, 'CBC retest')
  // A Hct draw after the visit answers it; a visit whose six weeks are up is not re-listed.
  assert.ok(!byUid(calendarEvents({ ...empty, phlebotomies, labs: [lipids('2026-11-01')] }, TODAY, 'x.test'))['phleb-retest-1@x.test'])
  assert.equal(calendarEvents({ ...empty, phlebotomies: [{ ...phlebotomies[0], date: '2026-09-01' }] }, TODAY, 'x.test').length, 0)
  // Events come out in date order.
  assert.deepEqual(events.map(e => e.start), [...events.map(e => e.start)].sort())
})

test('the iCalendar text: CRLF, folded at 75 octets, escaped, all-day with an exclusive end, alarms attached', () => {
  const long = 'x'.repeat(100)
  assert.equal(foldIcsLine(long).split('\r\n').length, 2)
  assert.equal(foldIcsLine(long).split('\r\n')[1][0], ' ')
  // Multi-byte characters never split: 40 en dashes are 120 octets → 25 fit the first line.
  const dashes = foldIcsLine('–'.repeat(40)).split('\r\n')
  assert.equal(dashes[0], '–'.repeat(25))
  assert.equal(escapeIcsText('a, b; c\\d\nnext'), 'a\\, b\\; c\\\\d\\nnext')

  const ics = renderIcs([
    { uid: 'draw-1@x.test', start: '2026-12-15', summary: 'Lab draw', description: 'Quest · CBC, lipids; fasting\nline two', alarm: { trigger: '-PT4H', text: 'Lab draw tomorrow' } },
    { uid: 'cycle-cp-7-mid@x.test', start: '2027-05-20', end: '2027-06-10', summary: 'Cycle checkpoint: mid-cycle draw' }
  ], { name: 'Health calendar', now: new Date('2026-11-09T15:04:05Z') })
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
  assert.ok(!/[^\r]\n/.test(ics), 'every line break is CRLF')
  assert.ok(ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75))
  assert.match(ics, /X-WR-CALNAME:Health calendar\r\n/)
  assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT6H\r\n/)
  assert.match(ics, /DTSTAMP:20261109T150405Z\r\n/)
  assert.match(ics, /DTSTART;VALUE=DATE:20261215\r\nDTEND;VALUE=DATE:20261216\r\n/, 'one day: the exclusive end is the next day')
  assert.match(ics, /DTSTART;VALUE=DATE:20270520\r\nDTEND;VALUE=DATE:20270610\r\n/)
  assert.match(ics, /DESCRIPTION:Quest · CBC\\, lipids\\; fasting\\nline two\r\n/)
  assert.match(ics, /TRANSP:TRANSPARENT\r\n/)
  assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT4H\r\nDESCRIPTION:Lab draw tomorrow\r\nEND:VALARM\r\n/)
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2)
  assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 1)
})
