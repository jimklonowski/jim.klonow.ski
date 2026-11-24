// The prompt-context loaders (server/utils/*Context.ts) — audit #44 item 36. Each used to answer
// "nothing on file" for ANY failed read, so one D1 blip while a digest was being built stored a
// recap without the donation deferral, the marker goals or a drug-gene note. Only a table that
// does not exist yet reads as empty now; anything else fails the build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadPgxNotes, pgxContext } from '../server/utils/pgxContext.ts'
import { loadMarkerGoals, markerGoalsContext } from '../server/utils/goalContext.ts'
import { loadPhlebotomies, phlebotomyContext } from '../server/utils/phlebotomyContext.ts'
import { cycleContext, loadCycles } from '../server/utils/cycleContext.ts'
import { loadPlannedDraws, plannedDrawContext } from '../server/utils/plannedDrawContext.ts'
import { vaccineContext } from '../server/utils/vaccineContext.ts'
import { accutaneContext } from '../server/utils/accutaneContext.ts'

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

// Audit #44 item 51: /ask and the labs summary ask several of these builders at once, and each
// used to read the planned cycles for itself. They take the cycles, or the promise of them.
test('the planned cycles are read once when the builders are handed the same read', async () => {
  /** A database with nothing in it that remembers every statement run against it. */
  const counting = () => {
    const ran = []
    const prepare = (sql) => {
      const stmt = {
        bind: () => stmt,
        all: async () => {
          ran.push(sql)
          return { results: [] }
        },
        first: async () => {
          ran.push(sql)
          return null
        }
      }
      return stmt
    }
    return { db: { prepare }, cycleReads: () => ran.filter(sql => /FROM cycles\b/.test(sql)).length }
  }
  const protocol = { rules: [], standing: [], asNeeded: [] }

  const apart = counting()
  await Promise.all([cycleContext(apart.db, AS_OF), phlebotomyContext(apart.db, AS_OF), accutaneContext(apart.db, AS_OF)])
  assert.equal(apart.cycleReads(), 3, 'each for itself, as before')

  const shared = counting()
  const cycles = loadCycles(shared.db)
  const out = await Promise.all([
    cycleContext(shared.db, AS_OF, cycles),
    phlebotomyContext(shared.db, AS_OF, cycles),
    accutaneContext(shared.db, AS_OF, cycles),
    markerGoalsContext(shared.db, AS_OF, protocol, cycles)
  ])
  assert.equal(shared.cycleReads(), 1, 'one read, shared')
  assert.deepEqual(out, ['', '', '', ''], 'and the same answers an empty database always gave')

  // The cycles themselves (the digest's way) still work, and read nothing more.
  const held = counting()
  await Promise.all([cycleContext(held.db, AS_OF, []), phlebotomyContext(held.db, AS_OF, []), accutaneContext(held.db, AS_OF, [])])
  assert.equal(held.cycleReads(), 0)

  // A shared read that fails is every builder's failure, never "no cycles".
  const lost = Promise.reject(new Error('D1_ERROR: Network connection lost.'))
  lost.catch(() => {})
  for (const build of [() => cycleContext(shared.db, AS_OF, lost), () => phlebotomyContext(shared.db, AS_OF, lost), () => accutaneContext(shared.db, AS_OF, lost)]) {
    await assert.rejects(build, /Network connection lost/)
  }
})
