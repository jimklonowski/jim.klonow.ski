// Unit tests for the planned-draw math the home strip, the /labs section, the calendar, the
// cycle dossier and the AI prompt context hang off (shared/utils/plannedDraws.ts). Same plain
// node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  activePrep, canFulfil, checkpointPlan, countdownLabel, drawLabel, matchDraw, nextPlannedDraw, planInWindow,
  plannedDrawState, plannedDrawStates, prepReminders, purposeLines
} from '../shared/utils/plannedDraws.ts'

function plan(overrides = {}) {
  return {
    id: 1, date: '2026-10-17', lab: 'Quest', panel: 'LC/MS panel', fasting: true, purpose: null,
    cycle_id: null, checkpoint_key: null, labs_date: null, ...overrides
  }
}

test('status derives from the date and the draws on file, never stored', () => {
  const p = plan()
  assert.equal(plannedDrawState(p, [], '2026-10-02').status, 'upcoming')
  assert.equal(plannedDrawState(p, [], '2026-10-02').inDays, 15)
  assert.equal(plannedDrawState(p, [], '2026-10-17').status, 'today')
  assert.equal(plannedDrawState(p, [], '2026-10-20').status, 'overdue')
  assert.equal(plannedDrawState(p, [], '2026-10-31').status, 'overdue') // 14 days: the last overdue day
  assert.equal(plannedDrawState(p, [], '2026-11-01').status, 'missed')
})

test('a draw inside the match window fulfils the plan; the stored link wins over the window', () => {
  const p = plan()
  assert.equal(matchDraw(p, ['2026-09-09']), null)
  assert.equal(matchDraw(p, ['2026-09-09', '2026-10-20']), '2026-10-20') // +3 days still counts
  assert.equal(matchDraw(p, ['2026-10-21']), null) // +4 does not
  assert.equal(matchDraw(p, ['2026-10-15', '2026-10-18']), '2026-10-18') // the nearest of two
  assert.equal(matchDraw(plan({ labs_date: '2026-10-24' }), ['2026-10-17']), '2026-10-24')
  // Drawn a day early, after the booking but before the booked date: done, not "upcoming" with a stray draw.
  const s = plannedDrawState(plan({ created_at: '2026-10-02T14:00:00Z' }), ['2026-10-16'], '2026-10-02')
  assert.equal(s.status, 'done')
  assert.equal(s.drawDate, '2026-10-16')
})

test('a draw that predates the plan is some other draw, however close the dates fall', () => {
  // Booked Oct 4 for Oct 5. The Oct 3 clinic draw sits inside the window but came before the booking.
  const p = plan({ date: '2026-10-05', created_at: '2026-10-04T15:00:00Z' })
  assert.equal(canFulfil(p, '2026-10-03'), false)
  assert.equal(canFulfil(p, '2026-10-04'), true, 'drawn the day it was booked: an appointment moved earlier')
  assert.equal(canFulfil(p, '2026-10-08'), true, '+3 days: the appointment slipped')
  assert.equal(canFulfil(p, '2026-10-09'), false, 'past the window')
  assert.equal(matchDraw(p, ['2026-10-03']), null)
  assert.equal(plannedDrawState(p, ['2026-10-03'], '2026-10-04').status, 'upcoming')
  // The booking day is the home-zone day: 03:30Z on Oct 4 is still the evening of Oct 3 in Chicago.
  assert.equal(canFulfil(plan({ date: '2026-10-05', created_at: '2026-10-04T03:30:00Z' }), '2026-10-03'), true)
  // A plan without a creation stamp (seeded, or older than the column) goes by the window alone.
  assert.equal(canFulfil(plan({ date: '2026-10-05' }), '2026-10-03'), true)
})

test('the next draw is the soonest open plan; overdue outranks upcoming, done and missed drop out', () => {
  const plans = [
    plan({ id: 1, date: '2026-09-09', labs_date: '2026-09-09' }),
    plan({ id: 2, date: '2026-09-25' }), // overdue on Oct 2
    plan({ id: 3, date: '2026-10-17' }),
    plan({ id: 4, date: '2026-07-01' }) // long past: missed
  ]
  const next = nextPlannedDraw(plans, ['2026-09-09'], '2026-10-02')
  assert.equal(next.plan.id, 2)
  assert.equal(next.status, 'overdue')
  assert.deepEqual(
    plannedDrawStates(plans, ['2026-09-09'], '2026-10-02').map(s => s.status),
    ['missed', 'done', 'overdue', 'upcoming']
  )
  assert.equal(nextPlannedDraw([plans[0], plans[3]], ['2026-09-09'], '2026-10-02'), null)
})

test('prep reminders carry the day they start and whether that day has come', () => {
  const p = plan()
  assert.deepEqual(prepReminders(p, '2026-10-15').map(r => [r.key, r.from, r.state]), [
    ['biotin', '2026-10-14', 'active'],
    ['training', '2026-10-16', 'ahead'],
    ['fasting', '2026-10-16', 'ahead'],
    ['orals', '2026-10-17', 'ahead'],
    ['timing', '2026-10-17', 'ahead']
  ])
  assert.deepEqual(activePrep(p, '2026-10-16').map(r => r.key), ['biotin', 'training', 'fasting'])
  assert.deepEqual(activePrep(p, '2026-10-02'), [])
  // A non-fasting draw has no fast to remind about.
  assert.ok(!prepReminders(plan({ fasting: false }), '2026-10-02').some(r => r.key === 'fasting'))
  assert.ok(prepReminders(p, '2026-10-02').every(r => r.short && r.text))
})

test('purpose splits into one question per line; the label and countdown read right', () => {
  assert.deepEqual(
    purposeLines({ purpose: 'T on 150 mg/wk\n\nHct after the cut; ferritin post-iron ' }),
    ['T on 150 mg/wk', 'Hct after the cut', 'ferritin post-iron']
  )
  assert.deepEqual(purposeLines({ purpose: null }), [])
  assert.equal(drawLabel(plan()), 'Quest · LC/MS panel · fasting')
  assert.equal(drawLabel(plan({ lab: null, panel: null, fasting: false })), 'non-fasting')
  assert.equal(countdownLabel(0), 'today')
  assert.equal(countdownLabel(1), 'tomorrow')
  assert.equal(countdownLabel(-1), 'yesterday')
  assert.equal(countdownLabel(15), 'in 15 days')
  assert.equal(countdownLabel(-3), '3 days ago')
})

test('a cycle checkpoint finds its booked draw by link, else by window', () => {
  const plans = [
    plan({ id: 1, date: '2026-11-14', cycle_id: 7, checkpoint_key: 'mid' }),
    plan({ id: 2, date: '2026-12-02' })
  ]
  assert.equal(checkpointPlan(plans, 7, 'mid').id, 1)
  assert.equal(checkpointPlan(plans, 7, 'end'), null)
  assert.equal(checkpointPlan(plans, 8, 'mid'), null)
  assert.equal(planInWindow(plans, '2026-11-25', '2026-12-10').id, 2)
  assert.equal(planInWindow(plans, '2026-12-20', '2026-12-31'), null)
})
