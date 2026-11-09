// The draw ledger (shared/utils/drawLedger.ts) — audit #43 item 64.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellText, ledgerRows, parseDoseLabel, protocolOn, protocolText } from '../shared/utils/drawLedger.ts'

const rules = [
  { compound: 'Testosterone Cypionate', doseLabel: '75 mg', weekdays: [1, 4], from: '2026-01-01', injected: true, doses: [{ from: '2026-01-01', label: '100 mg' }, { from: '2026-08-24', label: '75 mg' }] },
  { compound: 'hCG', doseLabel: '250 IU', weekdays: [2, 5], from: '2026-01-01', injected: true, doses: [{ from: '2026-01-01', label: '250 IU' }, { from: '2026-09-08', label: '300 IU' }, { from: '2026-10-24', label: '250 IU' }] },
  { compound: 'HGH', doseLabel: '2 IU', weekdays: [0, 1, 2, 3, 4, 5, 6], from: '2026-01-01', injected: true },
  { compound: 'Retatrutide', doseLabel: '2 mg', weekdays: [5], from: '2026-01-01', injected: true, to: '2026-06-01' },
  { compound: 'Finasteride', doseLabel: '1 mg', weekdays: [0, 1, 2, 3, 4, 5, 6], from: '2026-01-01' } // oral: not a ledger compound
]
const shot = (date, compound, dose, unit) => ({ date, peptides: [{ compound, dose, unit, time: '07:30' }] })
const journal = [shot('2026-09-07', 'Testosterone Cypionate', 75, 'mg'), shot('2026-10-15', 'Testosterone Cypionate', 75, 'mg')]
const draws = [
  { date: '2026-08-15', fasting: true, markers: { testosterone_total: 1180, testosterone_free: 24.1, estradiol: 106, hematocrit: 50.9, ferritin: 61 } },
  { date: '2026-09-09', fasting: false, markers: { testosterone_total: 1500, hematocrit: 51.7 }, notes: { testosterone_total: { date: '2026-09-09', note: 'ceiling', censored: true } } },
  { date: '2026-10-17', fasting: true, markers: { testosterone_total: 980, estradiol: 126, hematocrit: 51.7, ferritin: 48 }, notes: { estradiol: { date: '2026-10-17', note: 'LC/MS' } } }
]

test('the protocol in force on a date: injectables at that day\'s dose step, weekly totals, orals and stopped rules left out', () => {
  const aug = protocolOn(rules, '2026-08-15')
  assert.deepEqual(aug.map(c => [c.short, c.label, c.text]), [['T', '100 mg', '200 mg/wk'], ['hCG', '250 IU', '500 IU/wk'], ['HGH', '2 IU', '14 IU/wk']])
  const oct = protocolOn(rules, '2026-10-17')
  assert.deepEqual(oct.map(c => c.text), ['150 mg/wk', '600 IU/wk', '14 IU/wk'], 'the Aug 24 T cut and the Sep 8 hCG raise both show')
  assert.equal(protocolText(oct), 'T 150 mg/wk · hCG 600 IU/wk · HGH 14 IU/wk')
  assert.deepEqual(parseDoseLabel('2.5 iu'), { amount: 2.5, unit: 'iu' })
  assert.equal(parseDoseLabel('pea-sized'), null)
  assert.equal(protocolOn([{ compound: 'HGH', doseLabel: 'pea-sized', weekdays: [1], from: '2026-01-01', injected: true }], '2026-10-17')[0].text, 'pea-sized ×1/wk')
})

test('one row per draw, newest first: timing chips, and each marker with its change from the previous usable reading', () => {
  const rows = ledgerRows(draws, journal, rules)
  assert.deepEqual(rows.map(r => r.date), ['2026-10-17', '2026-09-09', '2026-08-15'])
  const [oct, sep, aug] = rows
  // Aug 15 has nothing before it: values, no deltas.
  assert.equal(cellText(aug.cells.testosterone_total), '1180')
  assert.equal(aug.cells.hematocrit.delta, null)
  // Sep 9's T is a ceiling: daggered, no delta, and never the "previous" for Oct.
  assert.equal(cellText(sep.cells.testosterone_total), '1500†')
  assert.equal(sep.cells.testosterone_total.censored, true)
  assert.equal(cellText(sep.cells.hematocrit), '51.7 (+0.8)')
  assert.equal(cellText(sep.cells.estradiol), '—')
  // Oct 17 diffs T against Aug 15 (1180), not the censored Sep 9.
  assert.equal(cellText(oct.cells.testosterone_total), '980 (−200)')
  assert.equal(oct.cells.testosterone_total.since, '2026-08-15')
  assert.equal(cellText(oct.cells.hematocrit), '51.7 (±0)')
  assert.equal(cellText(oct.cells.estradiol), '126 (+20)')
  assert.equal(oct.cells.estradiol.noted, true, 'the assay note rides along')
  assert.equal(cellText(oct.cells.ferritin), '48 (−13)')
  // Timing: Sep 9 is ~48 h after the Sep 7 shot; Oct 17 ~48 h after Oct 15.
  assert.match(sep.timing.find(c => c.short === 'T').text, /^48 h after T/)
  assert.match(oct.timing.find(c => c.short === 'T').text, /^48 h after T/)
  assert.deepEqual(aug.timing, [], 'no shot logged before Aug 15')
  assert.equal(oct.fasting, true)
  assert.equal(sep.fasting, false)
  assert.deepEqual(ledgerRows([], journal, rules), [])
})
