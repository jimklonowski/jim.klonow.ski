// The doctor's journal projection (shared/utils/journalProjection.ts) — audit #43 item 53: an
// allowlist, so nothing private leaks and a column added later stays private by default.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOCTOR_JOURNAL_FIELDS, doctorJournalEntry } from '../shared/utils/journalProjection.ts'

const full = {
  date: '2026-10-22',
  weight_lbs: 181.4,
  bp_systolic: 124,
  bp_diastolic: 78,
  rhr: 55,
  hrv: 61,
  peptides: [{ time: '04:15', compound: 'Testosterone Cypionate', dose: 75, unit: 'mg', site: 'left_glute' }],
  reconstitutions: [{ compound: 'hCG', vial_amount: 10000, vial_unit: 'iu', supplier: 'x', bac_water_ml: 2 }],
  food: { breakfast: 'eggs', dinner: 'steak' },
  sodas: [{ time: '14:00', drink: 'Coke', size: '12oz can' }],
  water: [{ time: '09:00', oz: 12 }],
  notes: 'slept badly, argued with the neighbour',
  // Something a later migration might add — never on the allowlist, so never sent.
  mood: 'low',
  private_flag: true
}

test('the doctor gets the date, vitals and the dose log; everything else is its empty shape', () => {
  const out = doctorJournalEntry(full)
  assert.deepEqual(Object.keys(out).sort(), [...DOCTOR_JOURNAL_FIELDS, 'food', 'sodas', 'water', 'notes'].sort())
  for (const f of DOCTOR_JOURNAL_FIELDS) assert.deepEqual(out[f], full[f], f)
  assert.deepEqual(out.food, {})
  assert.deepEqual(out.sodas, [])
  assert.deepEqual(out.water, [])
  assert.equal(out.notes, '')
  assert.equal('mood' in out, false, 'an unknown column is private by default')
  assert.equal('private_flag' in out, false)
  assert.ok(!JSON.stringify(out).includes('neighbour') && !JSON.stringify(out).includes('Coke'), 'nothing private in the JSON that leaves')
})

test('a blank note reads the same for the doctor as for everyone — parseJournalRow turns a null column into "", so does this', () => {
  // The projection used to send `null` where every other row carried '' (audit #43 item 53's
  // "notes: null vs '' drift"): a client branch on `notes === ''` saw the doctor's rows differently.
  assert.equal(doctorJournalEntry({ date: '2026-10-22', notes: '' }).notes, '')
  assert.equal(doctorJournalEntry({ date: '2026-10-22', notes: null }).notes, '')
  assert.equal(doctorJournalEntry({ date: '2026-10-22' }).notes, '')
})
