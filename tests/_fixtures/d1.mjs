// The real schema in in-memory SQLite (node:sqlite — the engine D1 runs), behind enough of D1's
// surface for server code to run against it unchanged: prepare().bind().all() / first() / run(),
// and batch() as the one transaction a D1 batch is. Foreign keys are enforced, as D1 enforces them.
//
// For the modules that build their answers out of SQL (the digest and ask fact sheets, the Whoop
// token store, the meal-estimate cache): a fake that answers canned rows would never notice a
// column the schema does not have. Audit #44 item 56.
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = readFileSync(new URL('../../server/database/schema.sql', import.meta.url), 'utf8')

/** An empty database with today's schema. */
export function freshDb() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

const plain = row => ({ ...row })
const READS = /^\s*(SELECT|PRAGMA|WITH)\b/i

/**
 * `db` as a D1Database. `ran` is every statement in the order it ran; `fail(match, message)`
 * makes every later statement whose SQL matches throw, the way a D1 outage does.
 */
export function d1Of(db) {
  const ran = []
  const failures = []
  const guard = (sql) => {
    ran.push(sql)
    const hit = failures.find(f => f.match.test(sql))
    if (hit) throw new Error(hit.message)
  }
  const statement = (sql, binds = []) => ({
    sql,
    binds,
    bind: (...b) => statement(sql, b),
    async all() {
      guard(sql)
      return { success: true, results: db.prepare(sql).all(...binds).map(plain), meta: {} }
    },
    async first(column) {
      guard(sql)
      const row = db.prepare(sql).get(...binds)
      return row ? (column ? row[column] : plain(row)) : null
    },
    async run() {
      guard(sql)
      if (READS.test(sql)) return { success: true, results: db.prepare(sql).all(...binds).map(plain), meta: { changes: 0 } }
      const done = db.prepare(sql).run(...binds)
      return { success: true, results: [], meta: { changes: Number(done.changes), last_row_id: Number(done.lastInsertRowid) } }
    }
  })
  return {
    ran,
    fail: (match, message = 'D1_ERROR: Network connection lost.') => failures.push({ match, message }),
    prepare: sql => statement(sql),
    async batch(statements) {
      db.exec('BEGIN')
      try {
        const out = []
        for (const s of statements) out.push(await s.run())
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

/** Inserts one row; objects and arrays are stored as JSON, the way the app stores them. */
export function insert(db, table, row) {
  const cols = Object.keys(row)
  const values = cols.map(c => (row[c] !== null && typeof row[c] === 'object' ? JSON.stringify(row[c]) : row[c]))
  db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...values)
}

/** Every row of a query, as plain objects. */
export const rowsOf = (db, sql, ...binds) => db.prepare(sql).all(...binds).map(plain)
