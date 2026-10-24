// The protocol tables' seeds (the protocol plan, P3): the generated server/database/seed-protocol.sql
// stays equal to what the constants produce, the rows it makes carry the schedule losslessly
// (one item per compound, a gapless dated history), and migration 0013's generic copy of the
// supplements table maps statuses and schedule spellings the way the prompts need them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { SEED_PATH, SUPERSEDED_SUPPLEMENT_ROWS, buildSeedSql, seedItems } from '../scripts/protocol-seed.mjs'
import { AS_NEEDED_COMPOUNDS, PROTOCOL_RULES, STANDING_COMPOUNDS } from '../shared/utils/protocolRules.ts'
import { shiftDays } from '../shared/utils/dates.ts'

const DIR = 'server/database/migrations'
const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
const PROTOCOL_MIGRATION = files.find(f => f.startsWith('0013_'))

function load(names) {
  const db = new DatabaseSync(':memory:')
  for (const f of names) db.exec(readFileSync(join(DIR, f), 'utf8'))
  return db
}

// node:sqlite rows are null-prototype objects, which strict deepEqual refuses against a literal.
const plain = row => ({ ...row })
const versionsOf = (db, name) => db.prepare(
  `SELECT v.from_date, v.to_date, v.dose_label, v.weekdays, v.note FROM protocol_versions v
   JOIN protocol_items p ON p.id = v.item_id WHERE p.name = ? ORDER BY v.from_date`
).all(name).map(plain)

const counts = db => db.prepare('SELECT (SELECT count(*) FROM protocol_items) AS items, (SELECT count(*) FROM protocol_versions) AS versions').get()

test('the committed seed SQL is exactly what the constants generate', () => {
  // CRLF checkouts read the file with \r\n; the generator writes \n.
  assert.equal(readFileSync(SEED_PATH, 'utf8').replaceAll('\r\n', '\n'), buildSeedSql())
})

test('the seed makes one item per compound with a gapless dated history, and re-running adds nothing', () => {
  const db = load(files)
  db.exec(buildSeedSql())

  const items = db.prepare('SELECT name, kind, category, injected, on_hand, notes, stop_note FROM protocol_items ORDER BY kind, sort, name').all().map(plain)
  const names = kind => items.filter(i => i.kind === kind).map(i => i.name).sort()
  assert.deepEqual(names('logged'), [...new Set(PROTOCOL_RULES.map(r => r.compound))].sort())
  assert.deepEqual(names('standing'), [...new Set(STANDING_COMPOUNDS.map(s => s.compound))].sort())
  assert.deepEqual(names('as_needed'), AS_NEEDED_COMPOUNDS.map(a => a.compound).sort())
  assert.equal(items.length, seedItems().length)

  // hCG: the four dose steps on Tue/Fri/Sun, then the Tue/Fri row — handing over 2026-10-23 → 24.
  assert.deepEqual(versionsOf(db, 'hCG').map(v => [v.from_date, v.to_date, v.dose_label, v.weekdays]), [
    ['2026-06-18', '2026-07-13', '250 IU', '[0,2,5]'],
    ['2026-07-14', '2026-07-20', '500 IU', '[0,2,5]'],
    ['2026-07-21', '2026-09-07', '250 IU', '[0,2,5]'],
    ['2026-09-08', '2026-10-23', '300 IU', '[0,2,5]'],
    ['2026-10-24', null, '250 IU', '[2,5]']
  ])
  // A rule without steps is one version at its doseLabel; an ended one closes on its `to`.
  assert.deepEqual(versionsOf(db, 'GHK-Cu').map(v => [v.from_date, v.to_date, v.dose_label, v.weekdays]), [['2026-02-01', '2026-09-01', '2 mg', '[0,1,2,3,4,5,6]']])
  assert.match(items.find(i => i.name === 'GHK-Cu').stop_note, /vial finished/)
  assert.equal(items.find(i => i.name === 'hCG').stop_note, null, 'a superseded cadence row is not a stop')
  // Standing meds keep each dated range and its prompt note; as-needed has no versions at all.
  assert.deepEqual(versionsOf(db, 'Tadalafil').map(v => [v.from_date, v.to_date, v.dose_label]), [['2025-06-01', '2026-06-01', '7 mg gummy'], ['2026-06-02', null, '5 mg tablet']])
  assert.match(versionsOf(db, 'Tadalafil')[1].note, /BP-lowering/)
  assert.deepEqual(versionsOf(db, 'BPC-157'), [])
  assert.equal(items.find(i => i.name === 'BPC-157').notes, 'for soreness/tightness')
  assert.deepEqual(items.find(i => i.name === 'Finasteride'), { name: 'Finasteride', kind: 'logged', category: 'oral', injected: 0, on_hand: 0, notes: null, stop_note: null })

  // Every item's history is gapless, never overlapping, with at most one open version — and a
  // logged item always knows when each version began.
  for (const { name, kind } of items) {
    const vs = versionsOf(db, name)
    for (let i = 1; i < vs.length; i++) {
      assert.ok(vs[i - 1].to_date != null, `${name}: an earlier version is still open`)
      assert.equal(shiftDays(vs[i - 1].to_date, 1), vs[i].from_date, `${name}: ${vs[i - 1].to_date} → ${vs[i].from_date}`)
    }
    if (kind === 'logged') assert.ok(vs.length && vs.every(v => v.from_date), `${name}: a logged version without from_date`)
  }

  const before = counts(db)
  db.exec(buildSeedSql())
  assert.deepEqual(counts(db), before)
})

test('0013 copies the supplements table into standing items, and the constants seed replaces the two it describes better', () => {
  const db = load(files.slice(0, files.indexOf(PROTOCOL_MIGRATION)))
  db.exec(`INSERT INTO supplements (name, dose, category, status, schedule, started, stopped, notes, sort, created_at) VALUES
    ('Iron bisglycinate', '50 mg', 'supplement', 'active', 'daily', NULL, NULL, 'Raised from 25 mg on 2026-08-22', 80, '2026-08-24T12:00:00.000Z'),
    ('Nizoral 1% (ketoconazole) shampoo', NULL, 'skin', 'active', 'Mondays + Thursdays', NULL, NULL, 'Hairline protection', 440, '2026-08-24T12:00:00.000Z'),
    ('Red light therapy', '~10 min', 'skin', 'active', 'each morning after shower', NULL, NULL, NULL, 400, '2026-08-24T12:00:00.000Z'),
    ('Turmeric', NULL, 'supplement', 'stopped', 'daily', NULL, '2026-08-22', 'Taken for many months before stopping', 130, '2026-08-24T12:00:00.000Z'),
    ('Old thing', NULL, 'supplement', 'stopped', 'daily', NULL, NULL, NULL, 131, '2026-08-24T12:00:00.000Z'),
    ('Anavar (oxandrolone)', '10 mg + 25 mg tablets', 'supplement', 'on_hand', 'daily', NULL, NULL, 'Weighing a lean-mass cycle', 200, '2026-08-24T12:00:00.000Z'),
    ('Xyzal (levocetirizine)', '5 mg', 'supplement', 'active', 'daily', '2026-09-01', NULL, NULL, 120, '2026-09-09T12:00:00.000Z'),
    ('Tadalafil (Cialis)', '5 mg', 'supplement', 'active', 'daily', NULL, NULL, NULL, 100, '2026-08-24T12:00:00.000Z'),
    ('Finasteride', '1 mg', 'supplement', 'active', 'daily', NULL, NULL, 'Also logged in the journal dose log', 110, '2026-08-24T12:00:00.000Z')`)
  db.exec(readFileSync(join(DIR, PROTOCOL_MIGRATION), 'utf8'))

  const item = name => plain(db.prepare('SELECT kind, category, injected, on_hand, notes, sort, created_at FROM protocol_items WHERE name = ?').get(name))
  assert.equal(counts(db).items, 9)
  assert.deepEqual(item('Iron bisglycinate'), { kind: 'standing', category: 'supplement', injected: 0, on_hand: 0, notes: 'Raised from 25 mg on 2026-08-22', sort: 80, created_at: '2026-08-24T12:00:00.000Z' })
  assert.deepEqual(versionsOf(db, 'Iron bisglycinate'), [{ from_date: null, to_date: null, dose_label: '50 mg', weekdays: '[0,1,2,3,4,5,6]', note: null }])
  assert.equal(item('Nizoral 1% (ketoconazole) shampoo').category, 'skin')
  assert.deepEqual(versionsOf(db, 'Nizoral 1% (ketoconazole) shampoo').map(v => [v.weekdays, v.note]), [['[1,4]', null]])
  assert.deepEqual(versionsOf(db, 'Red light therapy').map(v => [v.weekdays, v.note]), [[null, 'each morning after shower']], 'a freeform schedule is kept as the note')
  assert.deepEqual(versionsOf(db, 'Turmeric').map(v => [v.from_date, v.to_date]), [[null, '2026-08-22']])
  assert.deepEqual(versionsOf(db, 'Old thing').map(v => v.to_date), ['2026-08-24'], 'a stopped row without a date closes on its creation day')
  assert.equal(item('Anavar (oxandrolone)').on_hand, 1)
  assert.deepEqual(versionsOf(db, 'Anavar (oxandrolone)').map(v => [v.from_date, v.to_date, v.dose_label]), [[null, null, '10 mg + 25 mg tablets']], 'owned, not taken: the dose on hand, undated')
  assert.deepEqual(versionsOf(db, 'Xyzal (levocetirizine)').map(v => v.from_date), ['2026-09-01'])

  // Re-running the copy adds nothing.
  const before = counts(db)
  db.exec(readFileSync(join(DIR, PROTOCOL_MIGRATION), 'utf8'))
  assert.deepEqual(counts(db), before)

  // The constants seed removes the two copies it supersedes and leaves every other copy alone.
  db.exec(buildSeedSql())
  for (const name of SUPERSEDED_SUPPLEMENT_ROWS) {
    assert.equal(db.prepare('SELECT count(*) AS n FROM protocol_items WHERE name = ? AND kind = ?').get(name, 'standing').n, 0, name)
  }
  assert.deepEqual(db.prepare('SELECT kind FROM protocol_items WHERE name = ?').all('Finasteride').map(r => r.kind), ['logged'])
  assert.deepEqual(db.prepare('SELECT name FROM protocol_items WHERE name LIKE ?').all('Tadalafil%').map(r => r.name), ['Tadalafil'])
  assert.equal(item('Iron bisglycinate').kind, 'standing')
  assert.equal(counts(db).items, 9 - SUPERSEDED_SUPPLEMENT_ROWS.length + seedItems().length)
  // Cascade: deleting an item takes its versions with it.
  assert.equal(db.prepare('SELECT count(*) AS n FROM protocol_versions v WHERE NOT EXISTS (SELECT 1 FROM protocol_items p WHERE p.id = v.item_id)').get().n, 0)
})
