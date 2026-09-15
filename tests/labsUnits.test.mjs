// Unit tests for the K/uL → cells/uL guard on the WBC differential (shared/utils/labsUnits.ts).
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDifferentialInKPerUl, normalizeAbsDifferential } from '../shared/utils/labsUnits.ts'

// The 2026-09-09 CHW panel as extracted: differential in x10E3/uL alongside everything else.
const chw = {
  wbc: 7.1, platelets: 276, hemoglobin: 16.4,
  abs_neutrophils: 4.8, abs_lymphocytes: 1.6, abs_monocytes: 0.6, abs_eosinophils: 0.1, abs_basophils: 0,
  neutrophils_pct: 68, lymphocytes_pct: 22
}

// The 2026-08-15 Quest panel: already in cells/uL, with basophils/eosinophils legitimately < 100.
const quest = {
  wbc: 6.5, abs_neutrophils: 4544, abs_lymphocytes: 1281, abs_monocytes: 579, abs_eosinophils: 78, abs_basophils: 20
}

test('detects a K/uL differential from the neutrophil count', () => {
  assert.equal(isDifferentialInKPerUl(chw), true)
  assert.equal(isDifferentialInKPerUl(quest), false)
  assert.equal(isDifferentialInKPerUl({}), false)
  // Neutrophils missing → lymphocytes decide; eosinophils/basophils alone never do.
  assert.equal(isDifferentialInKPerUl({ abs_lymphocytes: 1.6 }), true)
  assert.equal(isDifferentialInKPerUl({ abs_eosinophils: 0.1, abs_basophils: 0 }), false)
})

test('converts the whole differential by 1000 and leaves everything else alone', () => {
  const out = normalizeAbsDifferential(chw)
  assert.deepEqual(out, {
    ...chw,
    abs_neutrophils: 4800, abs_lymphocytes: 1600, abs_monocytes: 600, abs_eosinophils: 100, abs_basophils: 0
  })
  assert.notEqual(out, chw, 'returns a copy when it converts')
})

test('a cells/uL differential passes through untouched', () => {
  assert.equal(normalizeAbsDifferential(quest), quest, 'same object when nothing changes')
})

test('float noise is rounded away', () => {
  // 0.7 * 1000 is 700.0000000000001 in IEEE-754; stored values must be whole cells.
  assert.equal(normalizeAbsDifferential({ abs_neutrophils: 3.1, abs_monocytes: 0.7 }).abs_monocytes, 700)
})

test('ignores non-numeric junk without throwing', () => {
  const out = normalizeAbsDifferential({ abs_neutrophils: 3.1, abs_basophils: null, abs_eosinophils: 'n/a' })
  assert.equal(out.abs_neutrophils, 3100)
  assert.equal(out.abs_basophils, null)
  assert.equal(out.abs_eosinophils, 'n/a')
})
