// Unit tests for the write-endpoint request schemas (shared/utils/schemas.ts).
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  zIdOnly, zJournalSave, zSodaAdd, zSodaRemove, zSupplementSave, zVialOpen, zVialSave
} from '../shared/utils/schemas.ts'

/** The first failure message, or null when the value parsed. */
function problem(schema, value) {
  const r = schema.safeParse(value)
  if (r.success) return null
  const i = r.error.issues[0]
  return `${i.path.join('.')}: ${i.message}`
}

const day = { date: '2026-09-22' }

test('a journal day fills in every optional field', () => {
  const out = zJournalSave.parse(day)
  assert.deepEqual(out, {
    date: '2026-09-22',
    weight_lbs: null, bp_systolic: null, bp_diastolic: null, rhr: null, hrv: null,
    peptides: [], reconstitutions: [], sodas: [], food: {}, notes: ''
  })
})

test('the date has to be a real calendar day', () => {
  assert.match(problem(zJournalSave, { date: '2026-13-40' }), /date: expected a YYYY-MM-DD date/)
  assert.match(problem(zJournalSave, { date: '2026-9-1' }), /date/)
  assert.match(problem(zJournalSave, {}), /date/)
  // A non-object body must not throw — it has to come back as a named failure.
  assert.ok(problem(zJournalSave, null))
  assert.ok(problem(zJournalSave, 'nope'))
})

test('vitals reject the shapes that used to reach a D1 bind', () => {
  assert.ok(problem(zJournalSave, { ...day, weight_lbs: '185' }), 'a numeric string is not a number')
  assert.ok(problem(zJournalSave, { ...day, rhr: {} }))
  assert.ok(problem(zJournalSave, { ...day, hrv: Number.POSITIVE_INFINITY }))
  // Explicit null stays null — that is how the form clears a reading.
  assert.equal(zJournalSave.parse({ ...day, weight_lbs: null }).weight_lbs, null)
})

test('a cleared number input reads as absent, not as a type error', () => {
  // Vue's v-model.number hands back '' when a numeric field is emptied, so this is what the day
  // form actually posts after clearing a vital — it has to mean null, not a failed save.
  const out = zJournalSave.parse({ ...day, weight_lbs: '', rhr: '', peptides: [{ compound: 'HGH', dose: '' }] })
  assert.equal(out.weight_lbs, null)
  assert.equal(out.rhr, null)
  assert.equal(out.peptides[0].dose, 0)
  assert.equal(zVialSave.parse({ compound: 'X', vial_amount: 5, cost: '', quantity: '', unit_count: '' }).cost, null)
  assert.equal(zVialSave.parse({ compound: 'X', vial_amount: 5, quantity: '' }).quantity, 1)
  assert.equal(zSupplementSave.parse({ name: 'Mg', sort: '' }).sort, 100)
  // A required amount is still required — clearing it is a real error, as it always was.
  assert.ok(problem(zVialSave, { compound: 'X', vial_amount: '' }))
  // Genuine junk is still rejected.
  assert.ok(problem(zJournalSave, { ...day, weight_lbs: 'abc' }))
})

test('doses keep their three units and tolerate legacy casing', () => {
  const dose = { compound: 'HGH', dose: 2.5, unit: 'IU' }
  assert.equal(zJournalSave.parse({ ...day, peptides: [dose] }).peptides[0].unit, 'iu')
  // Missing unit falls back rather than failing a re-save of an old row.
  assert.equal(zJournalSave.parse({ ...day, peptides: [{ compound: 'X', dose: 1 }] }).peptides[0].unit, 'mg')
  assert.ok(problem(zJournalSave, { ...day, peptides: [{ ...dose, unit: 'grams' }] }))
  assert.ok(problem(zJournalSave, { ...day, peptides: [{ compound: 'X', dose: -1 }] }))
  assert.ok(problem(zJournalSave, { ...day, peptides: 'not-an-array' }))
  assert.ok(problem(zJournalSave, { ...day, peptides: [null] }))
})

test('free text is bounded and unknown keys are dropped', () => {
  assert.ok(problem(zJournalSave, { ...day, notes: 'x'.repeat(20001) }))
  const out = zJournalSave.parse({ ...day, notes: '  slept badly  ', bogus: 1, food: { lunch: 'eggs', junk: 'x' } })
  assert.equal(out.notes, 'slept badly')
  assert.equal('bogus' in out, false)
  assert.deepEqual(out.food, { lunch: 'eggs' })
})

test('soda add and remove', () => {
  assert.deepEqual(zSodaAdd.parse({}), {})
  assert.ok(problem(zSodaAdd, { time: '25:00' }))
  assert.ok(problem(zSodaAdd, { time: '9:05' }), 'HH:MM must be zero-padded')
  assert.equal(zSodaAdd.parse({ time: '09:05' }).time, '09:05')
  // Query params arrive as strings, so the index coerces.
  assert.equal(zSodaRemove.parse({ date: '2026-09-22', index: '2' }).index, 2)
  // '$[-1]' is an invalid SQLite JSON path — the statement used to fail as a 500.
  assert.ok(problem(zSodaRemove, { date: '2026-09-22', index: '-1' }))
  assert.ok(problem(zSodaRemove, { date: '2026-09-22', index: '1.5' }))
  assert.ok(problem(zSodaRemove, { index: '0' }))
})

test('a vial needs a compound and a positive amount', () => {
  const vial = { compound: 'Testosterone Cypionate', vial_amount: 200 }
  const out = zVialSave.parse(vial)
  assert.equal(out.quantity, 1)
  assert.equal(out.status, 'sealed')
  assert.equal(out.vial_unit, 'mg')
  assert.equal(out.supplier, null, 'absent text becomes NULL, not ""')
  assert.ok(problem(zVialSave, { compound: '', vial_amount: 1 }))
  assert.ok(problem(zVialSave, { compound: 'X', vial_amount: 0 }))
  assert.ok(problem(zVialSave, { ...vial, status: 'half-used' }))
  assert.ok(problem(zVialSave, { ...vial, expiry: '2026-02-30' }))
  assert.ok(problem(zVialSave, { ...vial, id: 0 }))
  // An empty date string from a cleared input stores NULL.
  assert.equal(zVialSave.parse({ ...vial, expiry: '' }).expiry, null)
})

test('vial open and the id-only deletes', () => {
  assert.equal(zVialOpen.parse({ id: 3 }).bac_water_ml, null)
  assert.ok(problem(zVialOpen, {}))
  assert.ok(problem(zVialOpen, { id: 3, opened_date: 'yesterday' }))
  assert.deepEqual(zIdOnly.parse({ id: 7 }), { id: 7 })
  assert.ok(problem(zIdOnly, { id: '7' }), 'a JSON body sends a real number')
  assert.ok(problem(zIdOnly, {}))
})

test('supplements normalize their enums instead of rejecting', () => {
  const out = zSupplementSave.parse({ name: '  Magnesium ', status: 'bogus', category: 'nonsense' })
  assert.equal(out.name, 'Magnesium')
  assert.equal(out.status, 'active')
  assert.equal(out.category, 'supplement')
  assert.equal(out.schedule, 'daily')
  assert.equal(out.sort, 100)
  assert.ok(problem(zSupplementSave, { name: '' }))
  assert.ok(problem(zSupplementSave, {}))
})
