// The prompt-context loaders (server/utils/*Context.ts) — audit #44 item 36. Each used to answer
// "nothing on file" for ANY failed read, so one D1 blip while a digest was being built stored a
// recap without the donation deferral, the marker goals or a drug-gene note. Only a table that
// does not exist yet reads as empty now; anything else fails the build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadPgxNotes, pgxContext } from '../server/utils/pgxContext.ts'
import { loadMarkerGoals } from '../server/utils/goalContext.ts'
import { loadPhlebotomies, phlebotomyContext } from '../server/utils/phlebotomyContext.ts'
import { cycleContext, loadCycles } from '../server/utils/cycleContext.ts'
import { loadPlannedDraws, plannedDrawContext } from '../server/utils/plannedDrawContext.ts'
import { vaccineContext } from '../server/utils/vaccineContext.ts'

/** A database every statement of which fails with `message`. */
const failing = message => ({
  prepare: () => {
    const stmt = {
      bind: () => stmt,
      all: async () => { throw new Error(message) },
      first: async () => { throw new Error(message) }
    }
    return stmt
  }
})
const MISSING = failing('D1_ERROR: no such table: pgx_notes: SQLITE_ERROR')
const BLIP = failing('D1_ERROR: Network connection lost.')
const AS_OF = '2026-11-20'

const READS = {
  loadPgxNotes: [db => loadPgxNotes(db), []],
  pgxContext: [db => pgxContext(db), ''],
  loadMarkerGoals: [db => loadMarkerGoals(db), []],
  loadPhlebotomies: [db => loadPhlebotomies(db), []],
  phlebotomyContext: [db => phlebotomyContext(db, AS_OF), ''],
  loadCycles: [db => loadCycles(db), []],
  cycleContext: [db => cycleContext(db, AS_OF), ''],
  loadPlannedDraws: [db => loadPlannedDraws(db), []],
  plannedDrawContext: [db => plannedDrawContext(db, AS_OF), ''],
  vaccineContext: [db => vaccineContext(db, AS_OF), '']
}

test('a table that does not exist yet reads as nothing on file', async () => {
  for (const [name, [read, empty]] of Object.entries(READS)) {
    assert.deepEqual(await read(MISSING), empty, name)
  }
})

test('any other failure is a failure, never "nothing on file"', async () => {
  for (const [name, [read]] of Object.entries(READS)) {
    await assert.rejects(() => read(BLIP), /Network connection lost/, name)
  }
})
