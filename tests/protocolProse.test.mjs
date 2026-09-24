// Unit tests for the protocol prose the AI prompts carry: the schedule generated from
// PROTOCOL_RULES (it used to be a hand-kept twin that had to be edited alongside the rules),
// the digest's planned-vs-logged lines, and the dated notes' relevance windows.
//
//   node --test tests/
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cadenceOf, fmtDay, protocolSchedule, scheduleContext } from '../shared/utils/protocolProse.ts'
import { eventContext } from '../shared/utils/protocolEvents.ts'
import { PROTOCOL_RULES } from '../shared/utils/protocolRules.ts'
import { COMPOUND_INFO } from '../app/data/compoundInfo.ts'

const lineFor = (text, needle) => text.split('\n').find(l => l.includes(needle))

test('the schedule today: every running rule, with injectables and per-injection totals', () => {
  const s = protocolSchedule('2026-09-24')
  assert.match(lineFor(s, 'Testosterone Cypionate'), /^- Monday \+ Thursday: Testosterone Cypionate 75 mg per injection \(150 mg\/week — reduced from 100 mg/)
  assert.match(lineFor(s, 'hCG 300'), /^- Tuesday \+ Friday \+ Sunday: hCG 300 IU per injection \(900 IU\/week — raised from 250 IU on 2026-09-08\)\.$/)
  // Daily injectables get neither "per injection" nor a weekly total.
  assert.equal(lineFor(s, 'HGH 2.5'), '- Every day: HGH 2.5 IU (raised from 2 IU on 2026-09-03, via 2.25 IU on 2026-09-02).')
  assert.equal(lineFor(s, 'Finasteride'), '- Every day: Finasteride 1 mg.')
  assert.match(lineFor(s, 'Tadalafil'), /Tadalafil 5 mg tablet .*deliberately NOT in the dose log/)
  assert.equal(lineFor(s, 'only injectables'), '- Testosterone Cypionate, hCG, and HGH are the only injectables currently running.')
  assert.match(lineFor(s, 'BPC-157'), /as-needed only \(for soreness\/tightness\)/)
  assert.match(lineFor(s, 'GHK-Cu'), /^- GHK-Cu 2 mg daily ran until 2026-09-01 and is now discontinued — the vial finished/)
})

test('the schedule is as of its date, so a historical lab summary sees that day\'s protocol', () => {
  const aug = protocolSchedule('2026-08-15')
  // Still running then, with no hint of the stop that came later.
  assert.equal(lineFor(aug, 'GHK-Cu'), '- Every day: GHK-Cu 2 mg.')
  assert.match(lineFor(aug, 'only injectables'), /HGH, and GHK-Cu are the only injectables/)
  assert.doesNotMatch(aug, /discontinued/)

  // Before testosterone, hCG, and finasteride started; tadalafil was still the gummy.
  const may = protocolSchedule('2026-05-01')
  assert.doesNotMatch(may, /Testosterone|hCG|Finasteride|HGH/)
  assert.match(lineFor(may, 'Tadalafil'), /Tadalafil 7 mg gummy/)
  assert.match(lineFor(may, 'only injectable'), /GHK-Cu is the only injectable currently running/)
})

test('a stopped rule leaves the schedule once its ~4 months of relevance pass', () => {
  assert.match(protocolSchedule('2026-12-30'), /GHK-Cu .* discontinued/)
  assert.doesNotMatch(protocolSchedule('2027-01-15'), /GHK-Cu/)
})

test('cadence and day labels read Monday-first with the weekday resolved', () => {
  assert.equal(cadenceOf([0, 2, 5]), 'Tue+Fri+Sun')
  assert.equal(cadenceOf([0, 1, 2, 3, 4, 5, 6]), 'daily')
  assert.equal(fmtDay('2026-09-09'), 'Wed Sep 9')
})

test('the daily schedule check names due, logged, missed, and not-due compounds', () => {
  const logged = new Map([['HGH', new Set(['2026-09-09'])]])
  const line = scheduleContext(PROTOCOL_RULES, '2026-09-09', '2026-09-09', logged, '2026-09-10')
  assert.match(line, /^Schedule check for Wed Sep 9/)
  assert.match(line, /due today: HGH 2\.5 IU \(daily\), Finasteride 1 mg \(daily\)\./)
  assert.match(line, /Logged: HGH\. Missed \(due, never logged\): Finasteride\./)
  assert.match(line, /Testosterone Cypionate \(Mon\+Thu; next Thu Sep 10\)/)
  // The same day still under way reads as open, not missed.
  assert.match(scheduleContext(PROTOCOL_RULES, '2026-09-09', '2026-09-09', logged, '2026-09-09'), /Not yet logged: Finasteride — this recap is being written while the day is still under way/)
})

test('dated notes appear from their first day through their relevance window only', () => {
  assert.equal(eventContext('2026-09-04'), '')
  assert.match(eventContext('2026-09-06'), /Labor Day weekend travel/)
  // Travel ended 09-07 with the default 21-day window.
  assert.match(eventContext('2026-09-28'), /Labor Day/)
  assert.doesNotMatch(eventContext('2026-09-29'), /Labor Day/)
  // The draw-day note is only news for 3 days.
  assert.doesNotMatch(eventContext('2026-09-13'), /Bloodwork was drawn 2026-09-09/)
  // The iron protocol runs through 09-27 and stays 30 days, so the 10-17 draw still sees it.
  assert.match(eventContext('2026-10-17'), /iron-loading protocol/)
})

test('typicalDaily is a positive per-day amount wherever it is set', () => {
  for (const [name, info] of Object.entries(COMPOUND_INFO)) {
    const t = info.dosing.typicalDaily
    if (!t) continue
    assert.ok(Number.isFinite(t.amount) && t.amount > 0, `${name}: ${t.amount}`)
    assert.ok(['mg', 'mcg', 'iu'].includes(t.unit), `${name}: ${t.unit}`)
  }
  // The old prose parse read "200–400 mg weekly" at "every day or every other day" as 150 mg/day.
  assert.ok(Math.abs(COMPOUND_INFO['Trenbolone Acetate'].dosing.typicalDaily.amount - 300 / 7) < 1e-9)
  // As-needed compounds have no typical rate to fall back on.
  assert.equal(COMPOUND_INFO['PT-141'].dosing.typicalDaily, undefined)
})
