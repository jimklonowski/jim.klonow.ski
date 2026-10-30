// The day form's blank rows (app/data/journal.ts withoutBlankRows) — audit #43 item 20: a row
// "+ add" opened and nothing filled was saved, counted and drawn.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withoutBlankRows } from '../app/data/journal.ts'

const dose = compound => ({ time: '', compound, dose: 0, unit: 'mg', site: 'left_glute' })
const recon = compound => ({ compound, vial_amount: 0, vial_unit: 'mg', supplier: '', bac_water_ml: 0 })
const soda = (drink = '', size = '') => ({ time: '21:17', drink, size })

test('a dose or reconstitution without a compound is not saved', () => {
  const out = withoutBlankRows({ peptides: [dose('hCG'), dose(''), dose('  ')], reconstitutions: [recon(''), recon('HGH')], sodas: [] }, [])
  assert.deepEqual(out.peptides.map(p => p.compound), ['hCG'])
  assert.deepEqual(out.reconstitutions.map(r => r.compound), ['HGH'])
})

test('a soda row added and left blank is not saved; a named or sized one is', () => {
  const out = withoutBlankRows({ peptides: [], reconstitutions: [], sodas: [soda('Coke'), soda(), soda('', '12oz can')] }, [])
  assert.deepEqual(out.sodas, [soda('Coke'), soda('', '12oz can')])
})

test('blank sodas the day already held are kept — the form only drops what it added', () => {
  // 2026-08-01 holds two unnamed sodas; the form adds one more blank row and saves.
  const loaded = [soda(), soda()]
  const out = withoutBlankRows({ peptides: [], reconstitutions: [], sodas: [soda(), soda(), soda()] }, loaded)
  assert.equal(out.sodas.length, 2)
  // Removing one of them in the form still removes it.
  assert.equal(withoutBlankRows({ peptides: [], reconstitutions: [], sodas: [soda()] }, loaded).sodas.length, 1)
})
