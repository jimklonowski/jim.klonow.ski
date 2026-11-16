// The demo seed's date materialization (shared/utils/demoSeed.ts), audit #42 item 12: calendar
// days, not milliseconds, and a per-day zone offset for the workouts' local times. And the
// sandbox reset (server/tasks/demo/reset.ts), audit #44 item 31: what a visitor wrote is gone
// the next morning, in the tables the seed carries and in the ones it does not.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEMO_SCRATCH_TABLES, materializeSeedRows, materializeSeedValue, zoneOffsetAt } from '../shared/utils/demoSeed.ts'
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

// --- The reset (audit #44 item 31) ---

/** Every .ts file under `dir`. */
function tsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? tsFiles(path) : entry.name.endsWith('.ts') ? [path] : []
  })
}

test('every table a demo session can write is one the reset reseeds or empties', () => {
  const seed = JSON.parse(readFileSync(new URL('../scripts/demo/demo-seed.json', import.meta.url), 'utf8'))
  const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
  const tables = new Set([...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]))
  const covered = new Set([...Object.keys(seed.tables), ...DEMO_SCRATCH_TABLES])

  // The endpoints that let the demo role write: requireWriteAccess, or a role list naming it.
  const apiDir = fileURLToPath(new URL('../server/api/', import.meta.url))
  const writers = tsFiles(apiDir)
    .map(path => ({ name: relative(apiDir, path).replaceAll('\\', '/'), src: readFileSync(path, 'utf8') }))
    .filter(f => /requireWriteAccess\(|requireRole\([^)]*'demo'/.test(f.src))
  assert.ok(writers.length >= 20, `found ${writers.length} demo-writable endpoints`)

  const uncovered = []
  for (const { name, src } of writers) {
    // A table is named in the SQL itself, or in the audit call that goes with a helper's SQL.
    const named = new Set()
    const re = /\b(?:INSERT (?:OR \w+ )?INTO|DELETE FROM)\s+(\w+)|\bUPDATE (\w+) SET|audit(?:edDelete|Before)\(event, '(\w+)'|\btable: '(\w+)'/g
    for (const m of src.matchAll(re)) named.add(m[1] ?? m[2] ?? m[3] ?? m[4])
    if (/appendTapSql\(/.test(src)) named.add('journal_entries')
    const written = [...named].filter(t => tables.has(t))
    // A read-only endpoint behind requireRole(…'demo') names no table to write, and that is fine;
    // one behind requireWriteAccess always writes, so naming none means this scan went blind.
    if (/requireWriteAccess\(/.test(src)) assert.ok(written.length, `${name}: could not tell which table it writes`)
    for (const t of written) if (!covered.has(t)) uncovered.push(`${name} → ${t}`)
  }
  assert.deepEqual(uncovered, [], 'a demo visitor can write a table the reset neither reseeds nor empties — add it to DEMO_SCRATCH_TABLES (shared/utils/demoSeed.ts)')

  for (const t of DEMO_SCRATCH_TABLES) assert.ok(tables.has(t), `${t} is a real table`)
})

// reset.ts reaches these as Nitro auto-imports.
globalThis.defineTask = task => task
globalThis.runLoggedTask = () => {}
globalThis.TaskFailure = class TaskFailure extends Error {}
const { resetDemo } = await import('../server/tasks/demo/reset.ts')

/**
 * A database that writes down every statement it is asked to run. `columns` is what
 * PRAGMA table_info answers per table (absent = no such table); `held` is how many rows a
 * bare DELETE reports removing.
 */
function recordingEnv(seedTables, columns, held = {}) {
  const log = []
  const statement = sql => ({
    sql,
    bind: () => statement(sql),
    all: async () => ({ results: (columns[/PRAGMA table_info\((\w+)\)/.exec(sql)?.[1]] ?? []).map(name => ({ name })) }),
    run: async () => {
      log.push(sql)
      return { meta: { changes: held[/^DELETE FROM (\w+)$/.exec(sql)?.[1]] ?? 0 } }
    }
  })
  return {
    log,
    env: {
      DEMO_DB: {
        prepare: statement,
        batch: async (statements) => {
          for (const s of statements) log.push(s.sql)
        }
      },
      LABS_BUCKET: { get: async () => ({ json: async () => ({ version: 1, tables: seedTables }) }) }
    }
  }
}
const DAYS = { cols: ['date', 'notes'], jsonCols: [], rows: [['@D0', 'seeded']] }

test('the reset empties the tables a visitor can write that the seed has no rows for', async () => {
  const { env, log } = recordingEnv(
    { journal_entries: DAYS },
    { journal_entries: ['date', 'notes'], marker_goals: ['id'], pgx_notes: ['id'], drink_labels: ['key'] },
    { marker_goals: 2, pgx_notes: 1 }
  )
  const result = await resetDemo(env)
  assert.deepEqual(result, { tables: 1, rows: 1, cleared: 3 }, 'three rows a visitor left are counted in the run log')
  for (const t of DEMO_SCRATCH_TABLES) assert.equal(log.filter(sql => sql === `DELETE FROM ${t}`).length, 1, t)
  // After the reseed: a failure in this step cannot cost the sandbox its data.
  const insert = log.findIndex(sql => sql.startsWith('INSERT INTO journal_entries'))
  assert.ok(insert > 0 && insert < log.indexOf('DELETE FROM marker_goals'))
})

test('a scratch table this sandbox lacks is skipped; one the seed carries is replaced once, by the reseed', async () => {
  const goals = { cols: ['id', 'note'], jsonCols: [], rows: [[1, 'seeded goal']] }
  const { env, log } = recordingEnv(
    { journal_entries: DAYS, marker_goals: goals },
    { journal_entries: ['date', 'notes'], marker_goals: ['id', 'note'], pgx_notes: ['id'] }, // no drink_labels yet
    { pgx_notes: 4 }
  )
  const result = await resetDemo(env)
  assert.equal(result.cleared, 4)
  assert.equal(log.includes('DELETE FROM drink_labels'), false, 'no such table: nothing to empty, and no failed run')
  assert.equal(log.filter(sql => sql === 'DELETE FROM marker_goals').length, 1)
  assert.equal(log[log.indexOf('DELETE FROM marker_goals') + 1].startsWith('INSERT INTO marker_goals'), true, 'its wipe rides with its reseed')
})

test('a sandbox behind the seed is left exactly as it was: nothing is deleted, scratch tables included', async () => {
  const { env, log } = recordingEnv(
    { journal_entries: DAYS },
    { journal_entries: ['date'], marker_goals: ['id'], pgx_notes: ['id'], drink_labels: ['key'] } // no `notes` column
  )
  await assert.rejects(() => resetDemo(env), /no column notes/)
  assert.deepEqual(log, [])
})
