// Unit tests for the write-endpoint request schemas (shared/utils/schemas.ts).
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  zAsk, zAuditList, zAuditRestore, zCycleSave, zDateRange, zDigestGenerate, zHealthWebhook, zIdOnly, zInviteCreate, zInviteRevoke, zJournalSave, zLabsSave,
  zPasswordLogin, zPhotoThumbnailQuery, zPhotoUpdate, zPhotoUploadQuery, zPinLogin, zProfileSave, zRedeem, zSodaAdd,
  zSodaRemove, zSupplementSave, zVaccinationSave, zVialOpen, zVialParse, zVialSave, zWhoopCallbackQuery
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

test('share links: only guest roles, and out-of-range values clamp like the endpoint always did', () => {
  assert.deepEqual(zInviteCreate.parse({ role: 'doctor', label: '  Dr. Smith  ', expiresDays: 30, maxUses: 1 }),
    { role: 'doctor', label: 'Dr. Smith', expiresDays: 30, maxUses: 1 })
  // Owner and demo are never minted from a link.
  assert.ok(problem(zInviteCreate, { role: 'owner' }))
  assert.ok(problem(zInviteCreate, { role: 'demo' }))
  assert.ok(problem(zInviteCreate, {}))
  // 0 is the UI's "no deadline" / "unlimited"; absent and blank read the same way.
  const open = zInviteCreate.parse({ role: 'friend', expiresDays: 0, maxUses: '' })
  assert.equal(open.expiresDays, null)
  assert.equal(open.maxUses, null)
  assert.equal(open.label, null)
  // 1e15 days overflowed Date and made toISOString() throw; now it's ten years.
  assert.equal(zInviteCreate.parse({ role: 'friend', expiresDays: 1e15 }).expiresDays, 3650)
  assert.equal(zInviteCreate.parse({ role: 'friend', maxUses: 2.7 }).maxUses, 2)
  assert.equal(zInviteCreate.parse({ role: 'friend', label: 'x'.repeat(200) }).label.length, 80)
  assert.ok(problem(zInviteCreate, { role: 'friend', expiresDays: 'soon' }))
  assert.equal(zInviteRevoke.parse({ id: 'ab12' }).id, 'ab12')
  assert.ok(problem(zInviteRevoke, {}))
  assert.ok(problem(zInviteRevoke, { id: '' }))
})

test('credentials: a wrong type reads as a wrong password (401 path), never a 400 that leaks the shape', () => {
  assert.deepEqual(zPasswordLogin.parse({ password: 'hunter2' }), { password: 'hunter2' })
  assert.equal(zPasswordLogin.parse({ password: 12345 }).password, '')
  assert.equal(zPasswordLogin.parse({}).password, '')
  assert.equal(zPinLogin.parse({ pin: ['1'] }).pin, '')
  assert.ok(problem(zRedeem, { token: 'short' }))
  assert.ok(problem(zRedeem, { token: 'x'.repeat(32) + '!' }))
  assert.equal(zRedeem.parse({ token: 'a_B-'.repeat(8) }).token.length, 32)
})

test('AI endpoints: kind, dates and the parser text are checked before any model call', () => {
  assert.ok(problem(zDigestGenerate, { kind: 'monthly' }))
  assert.ok(problem(zDigestGenerate, { kind: 'daily', endDate: '2026-02-30' }))
  assert.deepEqual(zDigestGenerate.parse({ kind: 'weekly' }), { kind: 'weekly' })
  assert.ok(problem(zVialParse, { text: '   ' }))
  assert.ok(problem(zVialParse, { text: 'x'.repeat(4001) }))
  assert.equal(zVialParse.parse({ text: '  6 vials primo  ' }).text, '6 vials primo')
  // A malformed `today` falls back to the server's day rather than failing the question.
  assert.equal(zAsk.parse({ messages: [], today: 'yesterday' }).today, undefined)
  assert.equal(zAsk.parse({ messages: [], today: '2026-09-23' }).today, '2026-09-23')
})

test('photos, shots and profile facts', () => {
  assert.ok(problem(zPhotoUpdate, { date: '2026-09-01' }), 'id is required')
  assert.ok(problem(zPhotoUpdate, { id: 1, frameScale: 0 }))
  assert.ok(problem(zPhotoUpdate, { id: 1, frameOffsetX: 'left' }))
  assert.deepEqual(zPhotoUpdate.parse({ id: 1, frameOffsetX: -12.5 }), { id: 1, frameOffsetX: -12.5 })
  const shot = zVaccinationSave.parse({ date: '2026-09-10', vaccine: ' Flu ', product: '', notes: '  ' })
  assert.deepEqual(shot, { date: '2026-09-10', vaccine: 'Flu', product: null, notes: null })
  assert.ok(problem(zVaccinationSave, { date: '2026-09-10', vaccine: '' }))
  assert.equal(zProfileSave.parse({ key: 'blood_type' }).value, '', 'no value clears the fact')
  assert.equal(zProfileSave.parse({ key: 'blood_type', value: ' O+ ' }).value, 'O+')
})

test('cycle save: types and bounds here, cross-field rules in the handler', () => {
  const base = { name: 'Primo run', start_date: '2026-10-05', planned_weeks: 16, compounds: [{ compound: 'Methenolone Enanthate' }] }
  const out = zCycleSave.parse(base)
  assert.equal(out.start_precision, 'day', 'an older client that sends no precision keeps day precision')
  assert.equal(out.planned_days, null)
  assert.equal(out.actual_end, null)
  assert.equal(zCycleSave.parse({ ...base, planned_days: '' }).planned_days, null)
  assert.ok(problem(zCycleSave, { ...base, planned_weeks: 53 }))
  assert.ok(problem(zCycleSave, { ...base, planned_weeks: 8.5 }))
  assert.ok(problem(zCycleSave, { ...base, compounds: [] }))
  assert.ok(problem(zCycleSave, { ...base, start_precision: 'year' }))
  assert.ok(problem(zCycleSave, { ...base, name: '  ' }))
})

test('lab save: sanitized lists pass through, numbers degrade to null, _type is closed', () => {
  const out = zLabsSave.parse({ date: '2026-09-09', _type: 'dexa', weight_lbs: 'heavy', ag_ratio: 1.1, markers: { ldl: 90 }, total: { body_fat_pct: 18 } })
  assert.equal(out.weight_lbs, null, 'the handler then 400s with its own DEXA message')
  assert.equal(out.ag_ratio, 1.1)
  assert.deepEqual(out.markers, { ldl: 90 })
  assert.ok(problem(zLabsSave, { date: '2026-09-09', _type: 'xray' }))
  assert.ok(problem(zLabsSave, { date: 'Sep 9' }))
  assert.ok(problem(zLabsSave, { date: '2026-09-09', total: 'lots' }))
})

test('Health Auto Export webhook keeps good items and drops malformed ones instead of failing the batch', () => {
  const out = zHealthWebhook.parse({
    data: {
      metrics: [
        { name: 'body_mass', units: 'lb', data: [{ date: '2026-09-20 07:00:00 -0500', qty: 181.4 }] },
        { units: 'lb', data: [] }, // no name
        'garbage',
        { name: 'resting_heart_rate' } // no data array: kept, with none
      ],
      workouts: [{ name: 'Walk', start: '2026-09-20 18:00:00 -0500' }, 42]
    }
  })
  assert.deepEqual(out.data.metrics.map(m => [m.name, m.data.length]), [['body_mass', 1], ['resting_heart_rate', 0]])
  assert.equal(out.data.workouts.length, 1)
  assert.deepEqual(zHealthWebhook.parse({}), { data: { metrics: [], workouts: [] } })
})

test('photo upload query: a known category, and a bad client date falls back to EXIF', () => {
  assert.deepEqual(zPhotoUploadQuery.parse({ category: 'crown', date: '2026-09-22' }), { category: 'crown', date: '2026-09-22' })
  assert.deepEqual(zPhotoUploadQuery.parse({ category: 'chest', date: '2026-02-30' }), { category: 'chest', date: undefined })
  assert.equal(problem(zPhotoUploadQuery, { category: 'legs' }), 'category: Invalid or missing category')
  assert.equal(problem(zPhotoUploadQuery, {}), 'category: Invalid or missing category')
})

test('photo thumbnail query: the id arrives as a string and must be a row id', () => {
  assert.deepEqual(zPhotoThumbnailQuery.parse({ id: '42' }), { id: 42 })
  for (const id of [undefined, '', 'abc', '1.5', '0', '-3']) {
    assert.equal(problem(zPhotoThumbnailQuery, { id }), 'id: Missing or invalid id', `id=${id}`)
  }
})

test('whoop callback query: a declined grant (error, no code) is refused', () => {
  assert.deepEqual(zWhoopCallbackQuery.parse({ code: 'abc', state: 'uuid', scope: 'x' }), { code: 'abc', state: 'uuid' })
  assert.match(problem(zWhoopCallbackQuery, { error: 'access_denied', state: 'uuid' }), /^code:/)
  assert.match(problem(zWhoopCallbackQuery, { code: ['a', 'b'], state: 'uuid' }), /^code:/)
})

test('list date ranges: optional, inclusive, and never reversed', () => {
  assert.deepEqual(zDateRange.parse({}), {})
  assert.deepEqual(zDateRange.parse({ from: '2026-09-01', to: '2026-09-01' }), { from: '2026-09-01', to: '2026-09-01' })
  assert.equal(problem(zDateRange, { from: '2026-09-02', to: '2026-09-01' }), 'from: from must not be after to')
  assert.match(problem(zDateRange, { from: '2026-02-30' }), /^from:/)
})

test('audit history paging and restore ids', () => {
  assert.equal(zAuditList.parse({}).limit, 100)
  assert.equal(zAuditList.parse({ limit: '25' }).limit, 25)
  assert.ok(problem(zAuditList, { limit: '5000' }))
  assert.deepEqual(zAuditRestore.parse({ id: 4 }), { id: 4 })
  assert.ok(problem(zAuditRestore, { id: '4' }), 'a JSON body sends a real number')
})
