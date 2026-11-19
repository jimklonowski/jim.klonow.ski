// The draw ledger (shared/utils/drawLedger.ts) — audit #43 item 64.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellText, ledgerRows, parseDoseLabel, protocolOn, protocolText } from '../shared/utils/drawLedger.ts'
import { effectiveRules } from '../app/utils/adherence.ts'

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

// Audit #44 item 24: /labs/ledger passed the standing rules alone. The page now passes
// effectiveRules(cycles, rules), like the hematocrit page, the report and the marker cards.
test('with the cycles folded in, a draw mid-cycle lists the cycle compound and wears the turnover mark its start opened', () => {
  const standing = [{ compound: 'Testosterone Cypionate', doseLabel: '75 mg', weekdays: [1, 4], from: '2025-01-01', injected: true }]
  const cycle = { name: 'Primo', start_date: '2026-09-21', planned_weeks: 12, compounds: [{ compound: 'Methenolone Enanthate', dose: 200, unit: 'mg', weekdays: [1, 4], fromWeek: 1 }] }
  const draw = [{ date: '2026-10-17', fasting: true, markers: { hematocrit: 50.2 } }]
  const [bare] = ledgerRows(draw, [], standing)
  assert.deepEqual(bare.protocol.map(c => c.compound), ['Testosterone Cypionate'], 'the standing rules alone: no cycle compound')
  assert.deepEqual(bare.cells.hematocrit.tags, [], 'and no window: T has run unchanged for well over a turnover')
  const [merged] = ledgerRows(draw, [], effectiveRules([cycle], standing))
  assert.deepEqual(merged.protocol.map(c => [c.compound, c.text]), [['Testosterone Cypionate', '150 mg/wk'], ['Methenolone Enanthate', '400 mg/wk']])
  assert.deepEqual(merged.cells.hematocrit.tags.map(t => t.kind), ['transitional'], '26 days after the cycle started')
  const [before] = ledgerRows([{ date: '2026-09-01', fasting: true, markers: { hematocrit: 50.2 } }], [], effectiveRules([cycle], standing))
  assert.deepEqual([before.protocol.map(c => c.compound), before.cells.hematocrit.tags], [['Testosterone Cypionate'], []], 'a draw before the cycle is untouched')
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
  assert.equal(oct.cells.estradiol.noted, false, 'a note that only names the assay is not starred: the column says which assay it reads')
  assert.equal(oct.cells.estradiol.key, 'estradiol')
  assert.equal(cellText(oct.cells.ferritin), '48 (−13)')
  // Timing: Sep 9 is ~48 h after the Sep 7 shot; Oct 17 ~48 h after Oct 15.
  assert.match(sep.timing.find(c => c.short === 'T').text, /^48 h after T/)
  assert.match(oct.timing.find(c => c.short === 'T').text, /^48 h after T/)
  assert.deepEqual(aug.timing, [], 'no shot logged before Aug 15')
  assert.equal(oct.fasting, true)
  assert.equal(sep.fasting, false)
  assert.deepEqual(ledgerRows([], journal, rules), [])
})

test('a bound cell keeps the sign the report printed: a floor is "<", a ceiling ">" (audit #44 item 23)', () => {
  const rows = ledgerRows([
    { date: '2026-08-15', fasting: true, markers: { testosterone_total: 1180, ferritin: 61 } },
    { date: '2026-09-09', fasting: false, markers: { testosterone_total: 1500, ferritin: 5 }, readings: { testosterone_total: { qualifier: '>' }, ferritin: { qualifier: '<' } } },
    { date: '2026-10-17', fasting: true, markers: { testosterone_total: 980, ferritin: 48 } }
  ], [], [])
  const [oct, sep] = rows
  assert.equal(cellText(sep.cells.testosterone_total), '>1500†')
  assert.equal(sep.cells.testosterone_total.bound, 'ceiling')
  assert.equal(cellText(sep.cells.ferritin), '<5†')
  assert.equal(sep.cells.ferritin.bound, 'floor')
  assert.equal(sep.cells.hematocrit.bound, null, 'an empty cell has no bound')
  assert.equal(oct.cells.ferritin.bound, null)
  assert.equal(cellText(oct.cells.ferritin), '48 (−13)', 'diffed against the last measurement, never the bound')
})

test('the estradiol column reads the LC/MS/MS reading when a draw has it, and never diffs one assay against the other (audit #44 item 20)', () => {
  const e2 = (date, markers) => ({ date, fasting: true, markers })
  const rows = ledgerRows([
    e2('2026-05-01', { estradiol: 30 }),
    e2('2026-07-01', { estradiol: 57 }),
    e2('2026-08-15', { estradiol: 85, estradiol_sensitive: 106 }),
    e2('2026-09-20', { estradiol_sensitive: 110 }), // the add-on alone: was a blank cell
    e2('2026-10-17', { estradiol: 157, estradiol_sensitive: 126 }),
    e2('2026-11-20', { estradiol: 140 }) // the panel alone
  ], [], [])
  const cell = date => rows.find(r => r.date === date).cells.estradiol
  assert.deepEqual(rows.map(r => r.cells.estradiol.key).reverse(), ['estradiol', 'estradiol', 'estradiol_sensitive', 'estradiol_sensitive', 'estradiol_sensitive', 'estradiol'])
  assert.equal(cellText(cell('2026-07-01')), '57 (+27)')
  assert.equal(cellText(cell('2026-08-15')), '106', 'the first LC/MS/MS reading has nothing of its own kind before it')
  assert.equal(cellText(cell('2026-09-20')), '110 (+4)')
  assert.equal(cellText(cell('2026-10-17')), '126 (+16)')
  // The immunoassay-only draw diffs against the last immunoassay reading (Oct 17's 157), which
  // the column did not show but the record holds — not the LC/MS/MS 126 beside it, and not the
  // older immunoassay reading the column last printed (Jul 1's 57).
  assert.equal(cellText(cell('2026-11-20')), '140 (−17)')
  assert.equal(cell('2026-11-20').since, '2026-10-17')
})

test('each Hct/ferritin cell carries its reading tags: the turnover window after the T cut, and a phlebotomy before the draw (item 101)', () => {
  const visit = { id: 1, date: '2026-09-20', kind: 'donation', ml: 500, pre_hgb: null, notes: null, created_at: 'x' }
  const [oct, sep, aug] = ledgerRows(draws, journal, rules, [visit])
  // Aug 15 is before the Aug 24 cut: no tag. Sep 9 is 16 days into the window.
  assert.deepEqual(aug.cells.hematocrit.tags, [])
  assert.deepEqual(sep.cells.hematocrit.tags.map(t => t.kind), ['transitional'])
  // Oct 17: inside the window and 27 days after the visit — both; ferritin only the visit's.
  assert.deepEqual(oct.cells.hematocrit.tags.map(t => t.kind), ['transitional', 'post-phlebotomy'])
  assert.deepEqual(oct.cells.ferritin.tags.map(t => t.kind), ['post-phlebotomy'])
  assert.deepEqual(oct.cells.estradiol.tags, [], 'a hormone cell never wears one')
  assert.deepEqual(sep.cells.estradiol.tags, [], 'an empty cell has none')
  // Without the log the ledger still builds, tags from the windows alone.
  assert.deepEqual(ledgerRows(draws, journal, rules)[0].cells.hematocrit.tags.map(t => t.kind), ['transitional'])
})
