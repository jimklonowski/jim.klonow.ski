// The protocol plan, P10: the tables are a lossless home for the schedule. Migration 0013 plus the
// generated seed are loaded into node:sqlite, read back the way the loader (P4) will read them and
// mapped with shared/utils/protocolStore.ts; the result must equal the code constants it replaces —
// as data, as the prose every prompt carries on every date, as chart annotations, and as the
// day-by-day due list. The supplements copy is held to the same standard against the old table.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { buildSeedSql } from '../scripts/protocol-seed.mjs'
import { BEFORE_RECORDS, parseWeekdays, protocolFromRows, scheduleText, versionOverlaps } from '../shared/utils/protocolStore.ts'
import {
  AS_NEEDED_COMPOUNDS, PROTOCOL_RULES, STANDING_COMPOUNDS, doseLabelOn, scheduledFor, tallySchedule
} from '../shared/utils/protocolRules.ts'
import { protocolSchedule } from '../shared/utils/protocolProse.ts'
import { ruleAnnotations } from '../shared/utils/chartAnnotations.ts'
import { renderSupplementContext } from '../shared/utils/supplementProse.ts'
import { shiftDays } from '../shared/utils/dates.ts'

const DIR = 'server/database/migrations'
const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
const PROTOCOL_MIGRATION = files.find(name => name.startsWith('0013_'))
const before0013 = files.slice(0, files.indexOf(PROTOCOL_MIGRATION))
const plain = row => ({ ...row })

function migrated(names) {
  const db = new DatabaseSync(':memory:')
  for (const f of names) db.exec(readFileSync(join(DIR, f), 'utf8'))
  return db
}

function seeded() {
  const db = migrated(files)
  db.exec(buildSeedSql())
  return db
}

/** The loader's reads (P4): items by sort, versions by date. */
function readProtocol(db) {
  const items = db.prepare('SELECT id, name, kind, category, injected, on_hand, notes, stop_note, sort FROM protocol_items ORDER BY sort, name').all().map(plain)
  const versions = db.prepare('SELECT id, item_id, from_date, to_date, dose_label, weekdays, note FROM protocol_versions ORDER BY item_id, from_date').all().map(plain)
  return protocolFromRows(items, versions)
}

const item = (id, over = {}) => ({ id, name: 'X', kind: 'logged', category: 'injectable', injected: 1, on_hand: 0, notes: null, stop_note: null, sort: 10, ...over })
const version = (item_id, from_date, to_date, dose_label, weekdays, over = {}) =>
  ({ id: 0, item_id, from_date, to_date, dose_label, weekdays: weekdays == null ? null : JSON.stringify(weekdays), note: null, ...over })
const DAILY = [0, 1, 2, 3, 4, 5, 6]

test('the seeded tables map back to the code constants exactly', () => {
  const p = readProtocol(seeded())
  assert.deepEqual(p.rules, PROTOCOL_RULES)
  assert.deepEqual(p.standing, STANDING_COMPOUNDS)
  assert.deepEqual(p.asNeeded, AS_NEEDED_COMPOUNDS)
  assert.deepEqual(p.supplements, [], 'the constants carry no supplements, and the copy ran on an empty table')
})

test('the prose every prompt carries is identical from the tables, on every date that matters', () => {
  const p = readProtocol(seeded())
  const dates = [
    '2026-01-15', '2026-05-01', '2026-06-13', '2026-06-19', '2026-07-14', '2026-08-15', '2026-09-01', '2026-09-02',
    '2026-09-09', '2026-09-24', '2026-10-17', '2026-10-23', '2026-10-24', '2026-10-27', '2026-12-30', '2027-01-15'
  ]
  for (const asOf of dates) assert.equal(protocolSchedule(asOf, p.rules, p.standing), protocolSchedule(asOf), asOf)
})

test('chart annotations, the due list day by day, and the schedule check agree with the constants', () => {
  const p = readProtocol(seeded())
  assert.deepEqual(ruleAnnotations(p.rules), ruleAnnotations(PROTOCOL_RULES))
  const dueLine = (rules, d) => scheduledFor(d, rules).map(r => `${r.compound} ${doseLabelOn(r, d)}`).join(', ')
  for (let d = '2026-01-01'; d <= '2027-03-31'; d = shiftDays(d, 1)) assert.equal(dueLine(p.rules, d), dueLine(PROTOCOL_RULES, d), d)
  const logged = new Map([['hCG', new Set(['2026-10-18', '2026-10-20', '2026-10-23'])], ['HGH', new Set(['2026-10-20'])]])
  assert.deepEqual(
    tallySchedule(p.rules, '2026-10-18', '2026-10-24', logged, '2026-10-26'),
    tallySchedule(PROTOCOL_RULES, '2026-10-18', '2026-10-24', logged, '2026-10-26')
  )
})

test('a gap between versions is a stop and a restart, a weekday change a handover, a dose-only change a step', () => {
  const { rules } = protocolFromRows([item(1)], [
    version(1, '2026-01-05', '2026-01-31', '1 mg', [1, 4]),
    version(1, '2026-02-01', '2026-02-20', '2 mg', [4, 1]), // same days, spelled in another order: a step
    version(1, '2026-03-01', '2026-03-31', '2 mg', [1, 4]), // a gap: stopped, then restarted
    version(1, '2026-04-01', null, '2 mg', [1]) // fewer days: the handover
  ])
  assert.deepEqual(rules, [
    { compound: 'X', doseLabel: '2 mg', weekdays: [1, 4], from: '2026-01-05', to: '2026-02-20', injected: true, doses: [{ from: '2026-01-05', label: '1 mg' }, { from: '2026-02-01', label: '2 mg' }] },
    { compound: 'X', doseLabel: '2 mg', weekdays: [1, 4], from: '2026-03-01', to: '2026-03-31', injected: true },
    { compound: 'X', doseLabel: '2 mg', weekdays: [1], from: '2026-04-01', injected: true }
  ])
  // Versions arrive in any order and come out by date; a logged item with no versions has no rule.
  const shuffled = protocolFromRows([item(1), item(2, { name: 'Empty' })], [
    version(1, '2026-02-01', null, '2 mg', [1]),
    version(1, '2026-01-05', '2026-01-31', '1 mg', [1])
  ])
  assert.deepEqual(shuffled.rules.map(r => [r.from, r.doses?.length ?? 0]), [['2026-01-05', 2]])
})

test('notes and stop notes land where the prompts read them', () => {
  const p = protocolFromRows([item(1, { stop_note: 'the vial finished' }), item(2, { name: 'Y', injected: 0, category: 'oral', sort: 20 })], [
    version(1, '2026-01-05', '2026-01-31', '1 mg', [1, 4], { note: 'while it runs' }),
    version(2, '2026-01-05', null, '5 mg', DAILY)
  ])
  assert.deepEqual(p.rules, [
    { compound: 'X', doseLabel: '1 mg', weekdays: [1, 4], from: '2026-01-05', to: '2026-01-31', injected: true, note: 'while it runs', stopNote: 'the vial finished' },
    { compound: 'Y', doseLabel: '5 mg', weekdays: DAILY, from: '2026-01-05' }
  ])
  // A stop note on an item still running is kept for later, not printed; a NULL from_date on a
  // logged version falls back to the dawn of records rather than breaking the date math.
  const running = protocolFromRows([item(1, { stop_note: 'later' })], [version(1, null, null, '1 mg', [1])]).rules[0]
  assert.equal(running.stopNote, undefined)
  assert.equal(running.from, BEFORE_RECORDS)
})

test('standing items split by category: oral meds are standing compounds, supplement/skin items the stack', () => {
  const p = protocolFromRows([
    item(1, { name: 'Tadalafil', kind: 'standing', category: 'oral', injected: 0 }),
    item(2, { name: 'Boron', kind: 'standing', category: 'supplement', injected: 0, sort: 40 }),
    item(3, { name: 'Anavar', kind: 'standing', category: 'supplement', injected: 0, on_hand: 1, notes: 'weighing it', sort: 200 }),
    item(4, { name: 'BPC-157', kind: 'as_needed', notes: 'for soreness' }),
    item(5, { name: 'Mystery', kind: 'someday' })
  ], [
    version(1, null, '2026-06-01', '7 mg gummy', DAILY, { note: 'gummies' }),
    version(1, '2026-06-02', null, '5 mg tablet', DAILY),
    version(2, null, null, '8 mg', DAILY)
  ])
  assert.deepEqual(p.standing, [
    { compound: 'Tadalafil', from: BEFORE_RECORDS, to: '2026-06-01', label: '7 mg gummy', note: 'gummies' },
    { compound: 'Tadalafil', from: '2026-06-02', to: null, label: '5 mg tablet' }
  ])
  assert.deepEqual(p.supplements, [
    { name: 'Boron', dose: '8 mg', category: 'supplement', status: 'active', schedule: 'daily', started: null, stopped: null, notes: null, sort: 40 },
    { name: 'Anavar', dose: null, category: 'supplement', status: 'on_hand', schedule: 'daily', started: null, stopped: null, notes: 'weighing it', sort: 200 }
  ])
  assert.deepEqual(p.asNeeded, [{ compound: 'BPC-157', note: 'for soreness' }])
  assert.deepEqual(p.rules, [], 'an unknown kind is left out, not guessed at')
})

test('weekday JSON and schedule spellings round-trip, and malformed JSON reads as no fixed days', () => {
  assert.deepEqual(parseWeekdays('[1,4]'), [1, 4])
  assert.deepEqual(parseWeekdays('[4,4,9,-1,"x"]'), [4])
  assert.equal(parseWeekdays('not json'), null)
  assert.equal(parseWeekdays(null), null)
  assert.equal(scheduleText(version(1, null, null, null, DAILY)), 'daily')
  assert.equal(scheduleText(version(1, null, null, null, [1, 4])), 'Mondays + Thursdays')
  assert.equal(scheduleText(version(1, null, null, null, [0])), 'Sundays')
  assert.equal(scheduleText(version(1, null, null, null, [5, 2])), 'Tuesdays + Fridays')
  assert.equal(scheduleText(version(1, null, null, null, null, { note: 'each morning after shower' })), 'each morning after shower')
  assert.equal(scheduleText(null), 'daily')
})

test('versions overlap when their inclusive ranges share a day; an unknown start or an open end reaches all the way', () => {
  const v = (from_date, to_date) => ({ from_date, to_date })
  assert.equal(versionOverlaps(v('2026-01-01', '2026-01-31'), v('2026-02-01', null)), false, 'adjacent days do not overlap')
  assert.equal(versionOverlaps(v('2026-01-01', '2026-01-31'), v('2026-01-31', null)), true, 'a shared last/first day does')
  assert.equal(versionOverlaps(v('2026-01-01', null), v('2026-06-01', null)), true, 'two open versions always do')
  assert.equal(versionOverlaps(v(null, '2026-01-31'), v('2025-01-01', '2025-01-02')), true, 'an unknown start reaches back')
  assert.equal(versionOverlaps(v(null, '2026-01-31'), v('2026-02-01', '2026-02-02')), false)
  assert.equal(versionOverlaps(v('2026-03-01', '2026-03-10'), v('2026-03-05', '2026-03-06')), true, 'containment')
})

test('the supplements copy in 0013 round-trips: the stack reads the same from the new tables as from the old', () => {
  const db = migrated(before0013)
  const rows = [
    { name: 'Iron bisglycinate', dose: '50 mg', category: 'supplement', status: 'active', schedule: 'daily', started: null, stopped: null, notes: 'Raised from 25 mg on 2026-08-22', sort: 80 },
    { name: 'Xyzal (levocetirizine)', dose: '5 mg', category: 'supplement', status: 'active', schedule: 'daily', started: '2026-09-01', stopped: null, notes: 'Replaced the prior OTC allergy pill', sort: 120 },
    { name: 'Turmeric', dose: null, category: 'supplement', status: 'stopped', schedule: 'daily', started: null, stopped: '2026-08-22', notes: 'Taken for many months before stopping', sort: 130 },
    { name: 'Anavar (oxandrolone)', dose: '10 mg + 25 mg tablets', category: 'supplement', status: 'on_hand', schedule: 'daily', started: null, stopped: null, notes: 'Weighing a lean-mass cycle', sort: 200 },
    { name: 'Red light therapy', dose: '~10 min', category: 'skin', status: 'active', schedule: 'each morning after shower', started: null, stopped: null, notes: null, sort: 400 },
    { name: 'Nizoral 1% (ketoconazole) shampoo', dose: null, category: 'skin', status: 'active', schedule: 'Mondays + Thursdays', started: null, stopped: null, notes: 'Hairline protection', sort: 440 },
    { name: 'Paul Mitchell Shampoo Two (clarifying)', dose: null, category: 'skin', status: 'active', schedule: 'Sundays', started: null, stopped: null, notes: null, sort: 450 }
  ]
  const insert = db.prepare('INSERT INTO supplements (name, dose, category, status, schedule, started, stopped, notes, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  for (const r of rows) insert.run(r.name, r.dose, r.category, r.status, r.schedule, r.started, r.stopped, r.notes, r.sort, '2026-08-24T12:00:00.000Z')
  db.exec(readFileSync(join(DIR, PROTOCOL_MIGRATION), 'utf8'))

  const p = readProtocol(db)
  assert.deepEqual(p.supplements, rows)
  for (const asOf of ['2026-08-15', '2026-08-22', '2026-08-23', '2026-09-09', '2026-10-23', '2027-01-15']) {
    assert.equal(renderSupplementContext(p.supplements, asOf), renderSupplementContext(rows, asOf), asOf)
  }
  assert.ok(renderSupplementContext(p.supplements, '2026-10-23').includes('Nizoral 1% (ketoconazole) shampoo (Mondays + Thursdays)'))
  assert.deepEqual([p.rules, p.standing, p.asNeeded], [[], [], []], 'nothing from the stack is scored against the dose log')
})
