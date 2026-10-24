#!/usr/bin/env node
// Seeds protocol_items / protocol_versions (migration 0013, the protocol plan P3) from the code
// constants they will replace — PROTOCOL_RULES, STANDING_COMPOUNDS and AS_NEEDED_COMPOUNDS in
// shared/utils/protocolRules.ts — so the seed cannot drift from the schedule the app scores
// against today. Writes server/database/seed-protocol.sql (committed and reviewed like a
// migration) and optionally applies it:
//
//   pnpm protocol:seed          — regenerate the .sql only
//   pnpm protocol:seed:local    — regenerate and apply to the local main database
//   pnpm protocol:seed:remote   — regenerate and apply to production (Jim runs this)
//
// MAIN DATABASE ONLY: these constants are the real protocol. The demo sandbox gets its standing
// items from the generic supplements copy inside 0013 and, later, its own schedule from the demo
// generator (P9).
//
// Re-running RE-SYNCS. Until the constants leave the code (P12) they own the items they describe:
// each run inserts a missing item, updates an existing one's fields, and replaces its versions
// wholesale (version ids churn; nothing references them), so a dose or cadence edited in the
// constants reaches the tables with `pnpm protocol:seed:remote` — and an edit made to one of
// these items any other way is overwritten by the next run. Hand-entered items (and the
// supplements copies, bar the two below) are never touched. tests/protocolSeed.test.mjs holds the
// committed file equal to what this generates and checks the rows it produces.
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AS_NEEDED_COMPOUNDS, PROTOCOL_RULES, STANDING_COMPOUNDS } from '../shared/utils/protocolRules.ts'
import { shiftDays } from '../shared/utils/dates.ts'

export const SEED_PATH = 'server/database/seed-protocol.sql'

// Rows the generic supplements copy in 0013 made for things the constants describe better: the
// constants carry a dated history (tadalafil's gummy → tablet switch, finasteride's start and its
// dose-log scoring), the supplements rows only a name and a dose. Removed before the constants go in.
export const SUPERSEDED_SUPPLEMENT_ROWS = ['Tadalafil (Cialis)', 'Finasteride']

// AS_NEEDED_COMPOUNDS carries no route; the one entry is an injectable peptide.
const AS_NEEDED_ROUTE = { 'BPC-157': { category: 'injectable', injected: 1 } }

const DAILY = JSON.stringify([0, 1, 2, 3, 4, 5, 6])
const NOW = 'strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')'

function lit(v) {
  if (v == null) return 'NULL'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replaceAll('\'', '\'\'')}'`
}

function groupBy(rows, key) {
  const map = new Map()
  for (const row of rows) {
    const k = row[key]
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(row)
  }
  return map
}

/** The constants as items with their versions, in insert order. Exported for the test. */
export function seedItems() {
  const items = []

  // Logged compounds: one item per compound. Each rule row is one cadence run and each dose step
  // inside it one version, closed the day before the next step or on the row's own `to`.
  let sort = 10
  for (const [name, rules] of groupBy(PROTOCOL_RULES, 'compound')) {
    const injected = rules.some(r => r.injected)
    const last = rules.at(-1)
    const versions = rules.flatMap((rule) => {
      const steps = rule.doses?.length ? rule.doses : [{ from: rule.from, label: rule.doseLabel }]
      return steps.map((step, i) => ({
        from_date: step.from,
        to_date: i + 1 < steps.length ? shiftDays(steps[i + 1].from, -1) : (rule.to ?? null),
        dose_label: step.label,
        weekdays: JSON.stringify(rule.weekdays),
        note: rule.note ?? null
      }))
    })
    items.push({
      name,
      kind: 'logged',
      category: injected ? 'injectable' : 'oral',
      injected: injected ? 1 : 0,
      notes: null,
      // A stop note is the item's only once nothing is running: a superseded cadence row's
      // stopNote (none today) would be history, not a stop.
      stop_note: last.to != null ? (last.stopNote ?? null) : null,
      sort,
      versions
    })
    sort += 10
  }

  // Standing meds: daily, never logged. One item per compound, one version per dated range.
  for (const [name, rows] of groupBy(STANDING_COMPOUNDS, 'compound')) {
    items.push({
      name,
      kind: 'standing',
      category: 'oral',
      injected: 0,
      notes: null,
      stop_note: null,
      sort: 100,
      versions: rows.map(s => ({ from_date: s.from, to_date: s.to, dose_label: s.label, weekdays: DAILY, note: s.note ?? null }))
    })
  }

  // As-needed: the item and its note, no versions — nothing is scheduled.
  for (const a of AS_NEEDED_COMPOUNDS) {
    const route = AS_NEEDED_ROUTE[a.compound] ?? { category: 'oral', injected: 0 }
    items.push({ name: a.compound, kind: 'as_needed', ...route, notes: a.note, stop_note: null, sort: 10, versions: [] })
  }
  return items
}

const keyOf = item => `name = ${lit(item.name)} AND kind = ${lit(item.kind)}`

// Insert the item if it is new, bring its fields up to date either way, and clear its versions
// for the fresh set that follows.
function itemSql(item) {
  return [
    `INSERT INTO protocol_items (name, kind, category, injected, on_hand, notes, stop_note, sort, created_at)
SELECT ${lit(item.name)}, ${lit(item.kind)}, ${lit(item.category)}, ${item.injected}, 0, ${lit(item.notes)}, ${lit(item.stop_note)}, ${item.sort}, ${NOW}
WHERE NOT EXISTS (SELECT 1 FROM protocol_items WHERE ${keyOf(item)});`,
    `UPDATE protocol_items SET category = ${lit(item.category)}, injected = ${item.injected}, notes = ${lit(item.notes)}, stop_note = ${lit(item.stop_note)}, sort = ${item.sort} WHERE ${keyOf(item)};`,
    `DELETE FROM protocol_versions WHERE item_id IN (SELECT id FROM protocol_items WHERE ${keyOf(item)});`
  ].join('\n')
}

function versionSql(item, v) {
  return `INSERT INTO protocol_versions (item_id, from_date, to_date, dose_label, weekdays, note, created_at)
SELECT id, ${lit(v.from_date)}, ${lit(v.to_date)}, ${lit(v.dose_label)}, ${lit(v.weekdays)}, ${lit(v.note)}, ${NOW} FROM protocol_items WHERE ${keyOf(item)};`
}

export function buildSeedSql() {
  const superseded = SUPERSEDED_SUPPLEMENT_ROWS.map(lit).join(', ')
  const lines = [
    '-- GENERATED by scripts/protocol-seed.mjs from shared/utils/protocolRules.ts — do not edit by hand.',
    '-- The standing protocol (PROTOCOL_RULES, STANDING_COMPOUNDS, AS_NEEDED_COMPOUNDS) as protocol_items +',
    '-- protocol_versions rows (migration 0013, the protocol plan P3). MAIN DATABASE ONLY: this is the real',
    '-- protocol; the demo sandbox has its own. Re-running RE-SYNCS these items to the constants (fields updated,',
    '-- versions replaced) and touches nothing else. tests/protocolSeed.test.mjs fails when this file is older',
    '-- than the constants — run `pnpm protocol:seed`.',
    '',
    '-- The generic supplements copy in 0013 made standing rows for two things the constants describe with a',
    '-- dated history; those copies go first.',
    `DELETE FROM protocol_versions WHERE item_id IN (SELECT id FROM protocol_items WHERE kind = 'standing' AND name IN (${superseded}));`,
    `DELETE FROM protocol_items WHERE kind = 'standing' AND name IN (${superseded});`,
    ''
  ]
  for (const item of seedItems()) {
    lines.push(`-- ${item.name} (${item.kind})`, itemSql(item))
    for (const v of item.versions) lines.push(versionSql(item, v))
    lines.push('')
  }
  return lines.join('\n')
}

function main() {
  writeFileSync(SEED_PATH, buildSeedSql())
  console.log(`wrote ${SEED_PATH} (${seedItems().length} items)`)
  const mode = process.argv.includes('--remote') ? 'remote' : process.argv.includes('--local') ? 'local' : null
  if (!mode) return
  // The binding name DB is the main database (wrangler.jsonc), as the db:migrate scripts address it.
  const flags = mode === 'remote' ? '--remote -y' : '--local'
  execSync(`npx wrangler d1 execute DB ${flags} --file ${SEED_PATH}`, { stdio: 'inherit' })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
