// The demo seed's date materialization (shared/utils/demoSeed.ts), audit #42 item 12: calendar
// days, not milliseconds, and a per-day zone offset for the workouts' local times.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { materializeSeedRows, materializeSeedValue, zoneOffsetAt } from '../shared/utils/demoSeed.ts'
import { shiftDays, weekdayOf } from '../shared/utils/dates.ts'
import { protocolFromRows } from '../shared/utils/protocolStore.ts'
import { tallySchedule } from '../shared/utils/protocolRules.ts'

const chicagoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })

test('@D<n> is n calendar days before the anchor; negative looks forward; other values pass through', () => {
  assert.equal(materializeSeedValue('@D0', '2026-10-20'), '2026-10-20')
  assert.equal(materializeSeedValue('@D1', '2026-10-20'), '2026-10-19')
  assert.equal(materializeSeedValue('@D-7', '2026-10-20'), '2026-10-27')
  assert.equal(materializeSeedValue('@D3 14:05:00', '2026-10-20'), '2026-10-17 14:05:00')
  assert.equal(materializeSeedValue('plain', '2026-10-20'), 'plain')
  assert.equal(materializeSeedValue(42, '2026-10-20'), 42)
  assert.equal(materializeSeedValue(null, '2026-10-20'), null)
})

test('the ms arithmetic it replaces put two offsets on one day across the fall-back; calendar days never do', () => {
  // The old script: yesterday = Date.now() − (n+1) × 24 h, read as a Chicago date. Seeding at
  // 23:50 CST on Nov 2 2026 (the day after the clocks went back) made offsets 0 and 1 the SAME day.
  const seededAt = Date.parse('2026-11-03T05:50:00Z')
  const old = n => chicagoDay.format(new Date(seededAt - (n + 1) * 86_400_000))
  assert.equal(old(0), old(1), 'the bug: a primary-key clash on journal_entries.date mid-seed')
  const anchor = chicagoDay.format(new Date(seededAt - 86_400_000))
  const days = Array.from({ length: 400 }, (_, n) => materializeSeedValue(`@D${n}`, anchor))
  assert.equal(new Set(days).size, 400, 'every offset its own day')
  for (let i = 1; i < days.length; i++) {
    assert.equal(Date.parse(days[i - 1] + 'T12:00:00Z') - Date.parse(days[i] + 'T12:00:00Z'), 86_400_000, `consecutive at ${i}`)
  }
})

test('the zone offset follows Chicago DST, hour by hour on the change days', () => {
  assert.equal(zoneOffsetAt('2026-07-15', '07:00:00'), '-0500', 'CDT')
  assert.equal(zoneOffsetAt('2026-01-15', '07:00:00'), '-0600', 'CST')
  assert.equal(zoneOffsetAt('2026-03-08', '01:30:00'), '-0600', 'before the spring-forward at 2am')
  assert.equal(zoneOffsetAt('2026-03-08', '03:30:00'), '-0500', 'after it')
  assert.equal(zoneOffsetAt('2026-11-01', '00:30:00'), '-0500', 'before the fall-back')
  assert.equal(zoneOffsetAt('2026-11-01', '03:00:00'), '-0600', 'after it')
  assert.equal(zoneOffsetAt('2026-07-15', '07:00'), '-0500', 'HH:MM is enough')
  assert.equal(zoneOffsetAt('2026-07-15', '12:00:00', 'UTC'), '+0000')
})

test('@Z in a time field becomes the offset of the materialized day', () => {
  assert.equal(materializeSeedValue('@D0 07:15:00 @Z', '2026-01-20'), '2026-01-20 07:15:00 -0600')
  assert.equal(materializeSeedValue('@D0 07:15:00 @Z', '2026-07-20'), '2026-07-20 07:15:00 -0500')
  // Anchored just after the fall-back, the same relative workout a week earlier is still on CDT.
  assert.equal(materializeSeedValue('@D1 18:00:00 @Z', '2026-11-03'), '2026-11-02 18:00:00 -0600')
  assert.equal(materializeSeedValue('@D8 18:00:00 @Z', '2026-11-03'), '2026-10-26 18:00:00 -0500')
})

test('@W[offsets] is the weekday set of those offsets, following the anchor', () => {
  // 2026-10-20 is a Tuesday.
  assert.equal(materializeSeedValue('@W[0]', '2026-10-20'), JSON.stringify([weekdayOf('2026-10-20')]))
  assert.equal(materializeSeedValue('@W[0]', '2026-10-20'), '[2]')
  assert.equal(materializeSeedValue('@W[0,1]', '2026-10-20'), '[1,2]', 'sorted')
  assert.equal(materializeSeedValue('@W[0, 7]', '2026-10-20'), '[2]', 'a week apart is one weekday')
  assert.equal(materializeSeedValue('@W[1]', '2026-10-27'), '[1]', 'the same offset a week later: the same weekday')
  assert.equal(materializeSeedValue('@W[1]', '2026-10-28'), '[2]', 'and the next day it has moved with the anchor')
})

test('the seeded protocol scores the persona as on schedule whatever day it is anchored to (the protocol plan, P9)', () => {
  const seed = JSON.parse(readFileSync(new URL('../scripts/demo/demo-seed.json', import.meta.url), 'utf8'))
  const objects = (table, anchor) => materializeSeedRows(table, anchor).map(r => Object.fromEntries(table.cols.map((c, i) => [c, r[i]])))
  for (const anchor of ['2026-11-05', '2026-03-10', '2026-07-19']) {
    const { rules } = protocolFromRows(objects(seed.tables.protocol_items, anchor), objects(seed.tables.protocol_versions, anchor))
    assert.ok(rules.some(r => r.compound === 'Testosterone Cypionate' && r.to === undefined), 'the standing TRT rule is open')
    const doseDates = new Map()
    for (const e of objects(seed.tables.journal_entries, anchor)) {
      for (const p of JSON.parse(e.peptides)) {
        if (!doseDates.has(p.compound)) doseDates.set(p.compound, new Set())
        doseDates.get(p.compound).add(e.date)
      }
    }
    const tallies = tallySchedule(rules, shiftDays(anchor, -119), anchor, doseDates, shiftDays(anchor, 1))
    for (const t of tallies) assert.deepEqual(t.offSchedule, [], `${t.rule.compound}: every dose on one of its days (anchor ${anchor})`)
    const trt = tallies.find(t => t.rule.compound === 'Testosterone Cypionate')
    assert.ok(trt.hit.length >= 28, `TRT hits ${trt.hit.length}`)
    assert.ok(trt.missed.length <= 6, `TRT misses ${trt.missed.length} (3% skipped pins plus unlogged days)`)
    // Retatrutide's three dose steps are one rule with steps, at 6 mg now.
    const reta = rules.filter(r => r.compound === 'Retatrutide')
    assert.equal(reta.length, 1)
    assert.deepEqual(reta[0].doses.map(d => d.label), ['2 mg', '4 mg', '6 mg'])
  }
})

test('the generated seed materializes with unique journal dates and seasonally correct workout offsets', () => {
  const seed = JSON.parse(readFileSync(new URL('../scripts/demo/demo-seed.json', import.meta.url), 'utf8'))
  for (const anchor of ['2026-11-05', '2026-03-10']) {
    const journal = materializeSeedRows(seed.tables.journal_entries, anchor)
    const dateCol = seed.tables.journal_entries.cols.indexOf('date')
    const dates = journal.map(r => r[dateCol])
    assert.equal(new Set(dates).size, dates.length, `journal_entries dates unique (anchor ${anchor})`)
    assert.ok(dates.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))

    const workouts = materializeSeedRows(seed.tables.workouts, anchor)
    const startCol = seed.tables.workouts.cols.indexOf('start_time')
    const starts = workouts.map(r => r[startCol]).filter(Boolean)
    assert.ok(starts.length > 50)
    assert.ok(starts.every(s => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} -0[56]00$/.test(s)), `shape: ${starts.find(s => !/-0[56]00$/.test(s))}`)
    assert.ok(starts.some(s => s.endsWith('-0600')) && starts.some(s => s.endsWith('-0500')), 'both seasons present over 600 days')
    for (const s of starts) {
      const [date, time] = s.split(' ')
      assert.equal(s.slice(-5), zoneOffsetAt(date, time), `offset matches the day for ${s}`)
    }
  }
})
