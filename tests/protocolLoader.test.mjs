// The protocol loader (the protocol plan, P4): the tables, read once per request; no tables or
// empty tables mean no schedule. A fake D1 over node:sqlite runs the real read against the real
// migrations, so the missing-table and empty cases are the ones a fresh database will hit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { AS_NEEDED, RULES, STANDING, seedSql } from './_fixtures/protocol.mjs'
import { loadProtocol, protocolFor, protocolFrom, publicProtocol, readProtocolRows } from '../server/utils/protocolLoader.ts'
import { EMPTY_PROTOCOL } from '../shared/utils/protocolStore.ts'
import { protocolSchedule } from '../shared/utils/protocolProse.ts'

const DIR = 'server/database/migrations'
const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
const PROTOCOL_MIGRATION = files.findIndex(name => name.startsWith('0013_'))
const plain = row => ({ ...row })

/** Enough of D1's surface for the loader — prepare().bind().all() and batch() — over node:sqlite,
 * counting the round trips. */
function fakeD1(db) {
  const d1 = {
    batches: 0,
    prepare(sql) {
      return {
        sql,
        binds: [],
        bind(...b) {
          this.binds = b
          return this
        },
        async all() {
          return { results: db.prepare(sql).all(...this.binds).map(plain) }
        }
      }
    },
    async batch(stmts) {
      d1.batches++
      return stmts.map(s => ({ results: db.prepare(s.sql).all(...s.binds).map(plain) }))
    }
  }
  return d1
}

/** Migrations through `upTo` (exclusive), optionally with a supplements row in place before 0013
 * copies it, and optionally the constants seed. */
function sqlite({ upTo = files.length, supplements = false, seed = false } = {}) {
  const db = new DatabaseSync(':memory:')
  files.slice(0, upTo).forEach((f, i) => {
    if (supplements && i === PROTOCOL_MIGRATION) {
      db.exec('INSERT INTO supplements (name, dose, category, status, schedule, sort, created_at) VALUES (\'Boron\', \'8 mg\', \'supplement\', \'active\', \'daily\', 40, \'2026-08-24T12:00:00.000Z\')')
    }
    db.exec(readFileSync(join(DIR, f), 'utf8'))
  })
  if (seed) db.exec(seedSql())
  return db
}

const event = (d1, role = 'owner', demo = d1) => ({ context: { cloudflare: { env: { DB: d1, DEMO_DB: demo } }, auth: { role } } })

test('before migration 0013 the tables are missing, and there is no schedule', async () => {
  const d1 = fakeD1(sqlite({ upTo: PROTOCOL_MIGRATION }))
  assert.equal(await readProtocolRows(d1), null)
  const p = await loadProtocol(d1)
  assert.equal(p, EMPTY_PROTOCOL)
  assert.equal(p.source, 'none')
  assert.deepEqual(p.rules, [])
})

test('migrated but empty tables are no schedule either; tables with rows are the protocol, logged items or not', async () => {
  assert.equal(await loadProtocol(fakeD1(sqlite())), EMPTY_PROTOCOL, 'nobody filled this database')
  assert.equal(protocolFrom(null), EMPTY_PROTOCOL)
  // Only the supplements copy ran (the demo sandbox until P9): that IS its protocol — no rules,
  // and the stack from the tables.
  const d1 = fakeD1(sqlite({ supplements: true }))
  const rows = await readProtocolRows(d1)
  assert.deepEqual(rows.items.map(i => [i.name, i.kind]), [['Boron', 'standing']])
  const p = await loadProtocol(d1)
  assert.equal(p.source, 'tables')
  assert.deepEqual(p.rules, [])
  assert.deepEqual(p.supplements.map(s => s.name), ['Boron'])
})

test('seeded: the tables are the protocol, and they read exactly like the fixture schedule', async () => {
  const p = await loadProtocol(fakeD1(sqlite({ supplements: true, seed: true })))
  assert.equal(p.source, 'tables')
  assert.deepEqual(p.rules, RULES)
  assert.deepEqual(p.standing, STANDING)
  assert.deepEqual(p.asNeeded, AS_NEEDED)
  assert.deepEqual(p.supplements.map(s => [s.name, s.dose, s.status]), [['Boron', '8 mg', 'active']])
  for (const asOf of ['2026-08-15', '2026-10-27']) {
    assert.equal(protocolSchedule(asOf, p.rules, p.standing, p.asNeeded), protocolSchedule(asOf, RULES, STANDING, AS_NEEDED))
  }
})

test('any other database failure propagates instead of reading as "the constants, then"', async () => {
  const broken = {
    prepare: sql => ({ sql }),
    async batch() {
      throw new Error('D1_ERROR: database is locked')
    }
  }
  await assert.rejects(readProtocolRows(broken), /locked/)
  await assert.rejects(loadProtocol(broken), /locked/)
})

test('every session is told its own database\'s protocol, the sandbox included', async () => {
  const fromTables = await loadProtocol(fakeD1(sqlite({ seed: true })))
  assert.equal(EMPTY_PROTOCOL.source, 'none')
  assert.deepEqual(EMPTY_PROTOCOL.rules, [])
  for (const role of ['owner', 'friend', 'doctor', 'demo', null]) {
    assert.equal(publicProtocol(fromTables, role), fromTables, String(role))
    assert.equal(publicProtocol(EMPTY_PROTOCOL, role), EMPTY_PROTOCOL, String(role))
  }
})

test('protocolFor reads the role\'s database once per request, however often it is asked', async () => {
  const main = fakeD1(sqlite({ seed: true }))
  const demo = fakeD1(sqlite({ supplements: true }))
  const owner = event(main, 'owner', demo)
  const first = protocolFor(owner)
  const second = protocolFor(owner)
  assert.equal(first, second, 'the same promise both times')
  assert.equal((await first).source, 'tables')
  assert.equal(main.batches, 1)
  assert.equal(demo.batches, 0)

  // A demo session is routed to the sandbox, whose own rows (the supplements copy) are its protocol.
  const visitor = event(main, 'demo', demo)
  assert.equal((await protocolFor(visitor)).source, 'tables')
  assert.deepEqual((await protocolFor(visitor)).rules, [])
  assert.equal(demo.batches, 1)
  assert.equal(main.batches, 1)
})
