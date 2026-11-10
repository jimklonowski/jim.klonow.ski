// The marker catalogue additions of audit #43 item 65 (app/data/biomarkers.ts +
// server/data/markerCaveats.ts): each key exists with a unit, a category and a range, the
// sensitive estradiol is its own key, and the drug caveats name the right compounds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BIOMARKERS } from '../app/data/biomarkers.ts'
import { MARKER_CAVEATS, READING_NOTES } from '../server/data/markerCaveats.ts'

test('cystatin C, free T4/T3, DHT and the sensitive estradiol are catalogued with units and ranges', () => {
  const expect = {
    cystatin_c: ['mg/L', 'metabolic'],
    t4_free: ['ng/dL', 'hormones'],
    t3_free: ['pg/mL', 'hormones'],
    dht: ['ng/dL', 'hormones'],
    estradiol_sensitive: ['pg/mL', 'hormones'],
    ck: ['U/L', 'metabolic']
  }
  for (const [key, [unit, category]] of Object.entries(expect)) {
    const m = BIOMARKERS[key]
    assert.ok(m, `${key} is catalogued`)
    assert.equal(m.unit, unit, `${key} unit`)
    assert.equal(m.category, category, `${key} category`)
    assert.ok(m.refMin !== undefined || m.refMax !== undefined, `${key} has a range`)
    assert.ok(!m.computed, `${key} is measured, so it is storable`)
  }
  assert.ok(BIOMARKERS.estradiol_sensitive.refMax < BIOMARKERS.estradiol.refMax, 'the LC/MS/MS range sits below the immunoassay\'s')
})

test('DHT is caveated on the 5-ARIs and the thyroid pair on growth hormone', () => {
  assert.deepEqual(MARKER_CAVEATS.dht.compounds, ['Finasteride', 'Dutasteride'])
  assert.match(MARKER_CAVEATS.dht.note, /two thirds/)
  for (const key of ['t4_free', 't3_free']) {
    assert.deepEqual(MARKER_CAVEATS[key].compounds, ['HGH', 'Somatropin'], key)
    assert.match(MARKER_CAVEATS[key].note, /T4 to T3/)
  }
})

test('the two split estradiol draws carry a note on both keys, neither censored', () => {
  for (const key of ['estradiol', 'estradiol_sensitive']) {
    assert.deepEqual(READING_NOTES[key].map(n => n.date), ['2026-08-15', '2026-10-17'], key)
    assert.ok(READING_NOTES[key].every(n => !n.censored), `${key} notes are provenance, not bounds`)
  }
  assert.match(READING_NOTES.estradiol_sensitive[1].note, /157/)
  assert.match(READING_NOTES.estradiol[1].note, /126/)
})
