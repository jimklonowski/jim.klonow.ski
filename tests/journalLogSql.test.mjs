// LOGGED_DAY_SQL must agree with isLoggedDay() row for row (shared/utils/journalLog.ts), audit
// #42 item 34 — the overview now counts logged days in the database. Runs both over the same
// rows on the REAL schema in node:sqlite, plus the compounds json_each query the handler uses.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { LOGGED_DAY_SQL, isLoggedDay, loggedStreak, loggedStreakFromDates } from '../shared/utils/journalLog.ts'

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')

/** One row per case: what the JS predicate sees (parsed) and what the table stores (JSON text). */
const CASES = [
  ['vitals only', { weight_lbs: 170.2, rhr: 55 }],
  ['defaults only', {}],
  ['a dose', { peptides: [{ compound: 'BPC-157', dose: 250, unit: 'mcg' }] }],
  ['a reconstitution', { reconstitutions: [{ compound: 'BPC-157' }] }],
  ['a soda', { sodas: [{ time: '14:00' }] }],
  ['a water tap', { water: [{ time: '09:00', oz: 12 }] }],
  ['one meal among blank slots', { food: { breakfast: '', lunch: 'eggs' } }],
  ['a null meal value', { food: { breakfast: null } }],
  ['whitespace-only food and notes', { food: { breakfast: '  ', dinner: '\n' }, notes: ' \t\r\n ' }],
  ['a note', { notes: 'slept badly' }],
  ['a note with inner spaces', { notes: '  late dinner  ' }],
  ['empty arrays and empty object', { peptides: [], sodas: [], water: [], reconstitutions: [], food: {} }]
]

function seed(db) {
  for (const [i, [, fields]] of CASES.entries()) {
    const date = `2026-01-${String(i + 1).padStart(2, '0')}`
    db.prepare(`INSERT INTO journal_entries (date, weight_lbs, rhr, peptides, reconstitutions, food, sodas, water, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      date, fields.weight_lbs ?? null, fields.rhr ?? null,
      JSON.stringify(fields.peptides ?? []), JSON.stringify(fields.reconstitutions ?? []), JSON.stringify(fields.food ?? {}),
      JSON.stringify(fields.sodas ?? []), JSON.stringify(fields.water ?? []), fields.notes ?? null
    )
  }
}

test('the SQL predicate and isLoggedDay agree on every case', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  seed(db)
  const sqlLogged = new Set(db.prepare(`SELECT date FROM journal_entries WHERE ${LOGGED_DAY_SQL} ORDER BY date`).all().map(r => r.date))
  for (const [i, [name, fields]] of CASES.entries()) {
    const date = `2026-01-${String(i + 1).padStart(2, '0')}`
    assert.equal(sqlLogged.has(date), isLoggedDay(fields), name)
  }
  // Sanity on the matrix itself: the hand-entered cases are logged, the rest are not.
  assert.equal(sqlLogged.size, 7)
})

test('the streak over dates equals the streak over full rows', () => {
  const rows = [
    { date: '2026-09-17', peptides: [{ compound: 'x' }] },
    { date: '2026-09-18', peptides: [{ compound: 'x' }] },
    { date: '2026-09-19', weight_lbs: 170 }, // vitals only: breaks it
    { date: '2026-09-20', notes: 'hi' },
    { date: '2026-09-21', sodas: [{ time: '12:00' }] }
  ]
  const dates = rows.filter(isLoggedDay).map(r => r.date)
  assert.equal(loggedStreakFromDates(dates, '2026-09-21'), 2)
  assert.equal(loggedStreakFromDates(dates, '2026-09-21'), loggedStreak(rows, '2026-09-21'))
  assert.equal(loggedStreakFromDates(dates, '2026-09-22'), 2, 'an unlogged today falls back to yesterday')
  assert.equal(loggedStreakFromDates([], '2026-09-22'), 0)
})

test('compounds via json_each: last dosed date per compound, most recent first, blanks skipped', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  const ins = db.prepare('INSERT INTO journal_entries (date, peptides) VALUES (?, ?)')
  ins.run('2026-10-01', JSON.stringify([{ compound: 'Tesamorelin', dose: 1 }, { compound: 'NAD+', dose: 100 }]))
  ins.run('2026-10-02', JSON.stringify([{ compound: 'Tesamorelin', dose: 1 }, { compound: '', dose: 0 }, { dose: 5 }]))
  ins.run('2026-10-03', JSON.stringify([]))
  const rows = db.prepare(`
    SELECT json_extract(dose.value, '$.compound') AS compound, MAX(j.date) AS lastDate
    FROM journal_entries AS j, json_each(COALESCE(j.peptides, '[]')) AS dose
    WHERE compound IS NOT NULL AND compound <> ''
    GROUP BY compound
    ORDER BY lastDate DESC, compound ASC`).all().map(r => ({ ...r }))
  assert.deepEqual(rows, [{ compound: 'Tesamorelin', lastDate: '2026-10-02' }, { compound: 'NAD+', lastDate: '2026-10-01' }])
})
