// The schedule the code constants described on 2026-10-24, the day they left the code (the
// protocol plan, P12): PROTOCOL_RULES, STANDING_COMPOUNDS and AS_NEEDED_COMPOUNDS as they were.
// A test fixture, not live data — the protocol lives in protocol_items / protocol_versions now.
// It gives the tests that pinned the real schedule something stable to pin, and `seedSql()`
// turns it into rows the way the retired seed script did (its last output for production is
// server/database/archive/seed-protocol-2026-10-24.sql), so the mapper can be proven lossless
// against a known set of rows.
import { shiftDays } from '../../shared/utils/dates.ts'

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

export const RULES = [
  {
    compound: 'Testosterone Cypionate', doseLabel: '75 mg', weekdays: [1, 4], from: '2026-06-18', injected: true,
    doses: [
      { from: '2026-06-18', label: '50 mg' },
      { from: '2026-06-22', label: '100 mg' },
      { from: '2026-08-24', label: '75 mg' }
    ]
  },
  {
    compound: 'hCG', doseLabel: '300 IU', weekdays: [0, 2, 5], from: '2026-06-18', to: '2026-10-23', injected: true,
    doses: [
      { from: '2026-06-18', label: '250 IU' },
      { from: '2026-07-14', label: '500 IU' },
      { from: '2026-07-21', label: '250 IU' },
      { from: '2026-09-08', label: '300 IU' }
    ]
  },
  // Sundays dropped and the dose cut together; the last 300 IU Tue/Fri/Sun shot was Fri 2026-10-23.
  { compound: 'hCG', doseLabel: '250 IU', weekdays: [2, 5], from: '2026-10-24', injected: true },
  {
    compound: 'HGH', doseLabel: '2.5 IU', weekdays: EVERY_DAY, from: '2026-06-13', injected: true,
    doses: [
      { from: '2026-06-13', label: '1 IU' },
      { from: '2026-06-20', label: '1.5 IU' },
      { from: '2026-07-02', label: '2 IU' },
      { from: '2026-07-17', label: '2.25 IU' },
      { from: '2026-07-22', label: '1.5 IU' },
      { from: '2026-08-11', label: '2 IU' },
      { from: '2026-09-03', label: '2.5 IU' }
    ]
  },
  {
    compound: 'GHK-Cu', doseLabel: '2 mg', weekdays: EVERY_DAY, from: '2026-02-01', to: '2026-09-01', injected: true,
    stopNote: 'the vial finished and another is not being reconstituted for the time being'
  },
  { compound: 'Finasteride', doseLabel: '1 mg', weekdays: EVERY_DAY, from: '2026-07-29' }
]

const TADALAFIL_SINCE = 'daily-protocol Cialis, taken each morning for endothelial/BP support since about June 2025'
const TADALAFIL_BP = 'Its mild BP-lowering effect is standing context when interpreting blood-pressure trends'

export const STANDING = [
  { compound: 'Tadalafil', from: '2025-06-01', to: '2026-06-01', label: '7 mg gummy', note: `${TADALAFIL_SINCE}. ${TADALAFIL_BP}` },
  { compound: 'Tadalafil', from: '2026-06-02', to: null, label: '5 mg tablet', note: `${TADALAFIL_SINCE}; 7 mg gummies until 2026-06-01, 5 mg tablets since. ${TADALAFIL_BP}` }
]

export const AS_NEEDED = [
  { compound: 'BPC-157', note: 'for soreness/tightness' }
]

const lit = v => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll('\'', '\'\'')}'`)
const CREATED = '2026-10-24T00:00:00.000Z'

/** The fixture as protocol_items / protocol_versions INSERTs with explicit ids (from 1000, clear
 * of anything migration 0013 copied in), items before versions. */
export function seedSql() {
  const out = []
  let id = 1000
  const item = (name, kind, category, injected, notes, stopNote, sort) => {
    id++
    out.push(`INSERT INTO protocol_items (id, name, kind, category, injected, on_hand, notes, stop_note, sort, created_at) VALUES (${id}, ${lit(name)}, ${lit(kind)}, ${lit(category)}, ${injected}, 0, ${lit(notes)}, ${lit(stopNote)}, ${sort}, '${CREATED}');`)
    return id
  }
  const version = (itemId, from, to, label, weekdays, note) => {
    out.push(`INSERT INTO protocol_versions (item_id, from_date, to_date, dose_label, weekdays, note, created_at) VALUES (${itemId}, ${lit(from)}, ${lit(to)}, ${lit(label)}, ${lit(weekdays)}, ${lit(note)}, '${CREATED}');`)
  }

  const byCompound = new Map()
  for (const r of RULES) byCompound.set(r.compound, [...(byCompound.get(r.compound) ?? []), r])
  let sort = 10
  for (const [name, rules] of byCompound) {
    const injected = rules.some(r => r.injected) ? 1 : 0
    const last = rules.at(-1)
    const itemId = item(name, 'logged', injected ? 'injectable' : 'oral', injected, null, last.to != null ? (last.stopNote ?? null) : null, sort)
    sort += 10
    for (const rule of rules) {
      const steps = rule.doses?.length ? rule.doses : [{ from: rule.from, label: rule.doseLabel }]
      steps.forEach((step, i) => version(
        itemId, step.from, i + 1 < steps.length ? shiftDays(steps[i + 1].from, -1) : (rule.to ?? null),
        step.label, JSON.stringify(rule.weekdays), rule.note ?? null
      ))
    }
  }
  const standing = new Map()
  for (const s of STANDING) standing.set(s.compound, [...(standing.get(s.compound) ?? []), s])
  for (const [name, rows] of standing) {
    const itemId = item(name, 'standing', 'oral', 0, null, null, 100)
    for (const s of rows) version(itemId, s.from, s.to, s.label, JSON.stringify(EVERY_DAY), s.note ?? null)
  }
  for (const a of AS_NEEDED) item(a.compound, 'as_needed', 'injectable', 1, a.note, null, 10)
  return out.join('\n')
}
