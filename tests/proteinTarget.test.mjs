// The protein target from DEXA lean mass (shared/utils/proteinTarget.ts) — audit #43 item 63.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proteinTargetFor, proteinTargetNote } from '../shared/utils/proteinTarget.ts'

const scans = [
  { date: '2026-06-10', total: { lean_mass_lbs: 134.3 } },
  { date: '2026-09-12', total: { lean_mass_lbs: 148.2 } },
  { date: '2026-10-01', total: {} } // a report without the whole-body lean figure
]

test('a fixed target wins; else g/lb × the latest scan with a lean figure; else nothing', () => {
  assert.deepEqual(proteinTargetFor({ protein_target_g: '150', protein_per_lb_lean: '1' }, scans), { grams: 150, source: 'fixed' })
  const lean = proteinTargetFor({ protein_per_lb_lean: '1' }, scans)
  assert.deepEqual(lean, { grams: 148, source: 'lean', perLb: 1, lean: 148.2, scanDate: '2026-09-12' })
  assert.equal(proteinTargetFor({ protein_per_lb_lean: '0.8' }, scans).grams, 119, '0.8 × 148.2 = 118.56 → 119')
  assert.equal(proteinTargetFor({ protein_per_lb_lean: '1' }, []), null, 'no scan, no target')
  assert.equal(proteinTargetFor({ protein_per_lb_lean: '1' }, [scans[2]]), null, 'a scan without lean is no scan')
  assert.equal(proteinTargetFor({}, scans), null)
  assert.equal(proteinTargetFor(null, scans), null)
  assert.equal(proteinTargetFor({ protein_target_g: '', protein_per_lb_lean: 'abc' }, scans), null, 'a cleared fixed target and a mistyped rule')
})

test('as of a date the target reads the scan then current — the home scrub sees what that day saw', () => {
  const july = proteinTargetFor({ protein_per_lb_lean: '1' }, scans, '2026-07-01')
  assert.equal(july.scanDate, '2026-06-10')
  assert.equal(july.grams, 134)
  assert.equal(proteinTargetFor({ protein_per_lb_lean: '1' }, scans, '2026-06-09'), null, 'before the first scan')
  assert.equal(proteinTargetFor({ protein_per_lb_lean: '1' }, scans, '2026-09-12').scanDate, '2026-09-12', 'the scan\'s own day counts')
})

test('the note names the rule', () => {
  assert.equal(proteinTargetNote(proteinTargetFor({ protein_per_lb_lean: '1' }, scans), 'Sep 12'), '1 g/lb × 148.2 lb lean · DEXA Sep 12')
  assert.equal(proteinTargetNote({ grams: 150, source: 'fixed' }, ''), 'set by hand')
})
