// The tracked-table list against the schema, and the restore of an entry whose table is gone
// (server/utils/audit.ts, audit #44 item 40). `supplements` stayed in AUDIT_KEYS after migration
// 0014 dropped the table, so restoring one of its old entries read a table that does not exist: a
// 500. This runs the real listAudit / restoreAudit over node:sqlite and the real schema.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

globalThis.createError = ({ statusCode, message }) => Object.assign(new Error(message), { statusCode })
const { AUDIT_KEYS, RETIRED_AUDIT_TABLES, listAudit, restoreAudit } = await import('../server/utils/audit.ts')

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
const fresh = () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(schema)
  return db
}
const plain = r => ({ ...r })

/** Enough of D1 for the audit utils: prepare().bind().first()/all()/run(), and batch() as one transaction. */
function fakeD1(db) {
  return {
    prepare: sql => ({
      sql,
      binds: [],
      bind(...b) {
        this.binds = b
        return this
      },
      async first() {
        const r = db.prepare(sql).get(...this.binds)
        return r ? plain(r) : null
      },
      async all() {
        return { results: db.prepare(sql).all(...this.binds).map(plain) }
      },
      async run() {
        db.prepare(sql).run(...this.binds)
        return { success: true }
      }
    }),
    async batch(stmts) {
      db.exec('BEGIN')
      try {
        const out = stmts.map(s => ({ results: db.prepare(s.sql).all(...s.binds).map(plain) }))
        db.exec('COMMIT')
        return out
      }
      catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    }
  }
}
const NO_PHOTOS = { head: async () => null }
const log = (db, action, table, key, summary, before) => Number(db.prepare(`
  INSERT INTO audit_log (at, action, table_name, row_key, summary, before) VALUES ('2026-10-01T00:00:00.000Z', ?1, ?2, ?3, ?4, ?5)
`).run(action, table, String(key), summary, before ? JSON.stringify(before) : null).lastInsertRowid)
const logCount = db => db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n

test('every tracked table exists in the schema with its key column; a retired one is in neither', () => {
  const db = fresh()
  for (const [table, key] of Object.entries(AUDIT_KEYS)) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
    assert.ok(cols.length > 0, `${table} is tracked but not in schema.sql — drop it from AUDIT_KEYS and name it in RETIRED_AUDIT_TABLES`)
    assert.ok(cols.includes(key), `${table} has no ${key} column`)
  }
  for (const table of Object.keys(RETIRED_AUDIT_TABLES)) {
    assert.equal(Object.hasOwn(AUDIT_KEYS, table), false, `${table} is retired and still tracked`)
    assert.equal(db.prepare(`PRAGMA table_info(${table})`).all().length, 0, `${table} is called retired and is still in schema.sql`)
  }
  assert.ok(Object.hasOwn(RETIRED_AUDIT_TABLES, 'supplements'))
})

test('an old entry on a dropped table is listed as blocked and its restore is a 409, never a read of the missing table', async () => {
  const db = fresh()
  const d1 = fakeD1(db)
  const old = { id: 4, name: 'Boron', dose: '8 mg', category: 'supplement', status: 'active' }
  const ids = [
    log(db, 'delete', 'supplements', 4, 'Boron 8 mg', old),
    log(db, 'update', 'supplements', 4, 'Boron 8 mg', old),
    log(db, 'create', 'supplements', 4, 'Boron 8 mg', null)
  ]
  const listed = await listAudit(d1, 50)
  assert.equal(listed.length, 3)
  for (const e of listed) assert.equal(e.blocked, RETIRED_AUDIT_TABLES.supplements)
  for (const id of ids) {
    await assert.rejects(() => restoreAudit(d1, id, NO_PHOTOS), err => err.statusCode === 409 && err.message === `Can't restore: ${RETIRED_AUDIT_TABLES.supplements}`)
  }
  assert.equal(logCount(db), 3, 'nothing was logged')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE restored_at IS NOT NULL').get().n, 0, 'and no entry was marked restored')
})

test('a table name that was never tracked — an object property included — is not restorable', async () => {
  const db = fresh()
  const d1 = fakeD1(db)
  for (const name of ['whoop_tokens', 'toString', 'constructor']) {
    const id = log(db, 'delete', name, 1, 'x', { id: 1 })
    await assert.rejects(() => restoreAudit(d1, id, NO_PHOTOS), err => err.statusCode === 409 && /not a restorable table/.test(err.message), name)
  }
  assert.deepEqual((await listAudit(d1, 50)).map(e => e.blocked), Array(3).fill('not a restorable table'))
})

test('a tracked table still restores: a deleted vial comes back, the restore is logged and the entry marked', async () => {
  const db = fresh()
  const d1 = fakeD1(db)
  db.prepare(`INSERT INTO vials (id, compound, vial_amount, vial_unit, form, quantity, status, created_at) VALUES (7, 'hCG', 10000, 'iu', 'vial', 1, 'sealed', '2026-10-01')`).run()
  const before = plain(db.prepare('SELECT * FROM vials WHERE id = 7').get())
  db.prepare('DELETE FROM vials WHERE id = 7').run()
  const id = log(db, 'delete', 'vials', 7, 'hCG 10000 iu', before)
  assert.equal((await listAudit(d1, 50))[0].blocked, null)
  assert.deepEqual(await restoreAudit(d1, id, NO_PHOTOS), { table: 'vials', key: '7' })
  assert.deepEqual(plain(db.prepare('SELECT * FROM vials WHERE id = 7').get()), before)
  assert.equal(db.prepare('SELECT action FROM audit_log WHERE id != ?1').get(id).action, 'restore')
  assert.notEqual(db.prepare('SELECT restored_at FROM audit_log WHERE id = ?1').get(id).restored_at, null)
  await assert.rejects(() => restoreAudit(d1, id, NO_PHOTOS), err => err.statusCode === 409 && /already restored/.test(err.message))
})
