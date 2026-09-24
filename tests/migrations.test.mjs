// Keeps the two descriptions of the database in step: server/database/migrations (what
// `wrangler d1 migrations apply` actually runs, in order, recorded in each database's
// d1_migrations ledger) and server/database/schema.sql (the commented snapshot people read).
// Both are loaded into in-memory SQLite (node:sqlite, the same engine D1 runs) and compared
// column by column and index by index, so a migration without its schema.sql edit — or the
// reverse — fails here instead of on a fresh database months later.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DIR = 'server/database/migrations'
const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()

// Tables, columns, and indexes — what the app's SQL depends on. Raw sqlite_master.sql can't be
// compared: an ALTER TABLE ADD COLUMN reformats the stored CREATE text.
function shape(db) {
  const out = {}
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all()
  for (const { name } of tables) {
    const columns = db.prepare(`PRAGMA table_info(${name})`).all()
      .map(c => `${c.name} ${c.type}${c.notnull ? ' NOT NULL' : ''}${c.dflt_value != null ? ` DEFAULT ${c.dflt_value}` : ''}${c.pk ? ' PK' : ''}`)
      .sort()
    const indexes = db.prepare(`PRAGMA index_list(${name})`).all()
      .filter(i => i.origin === 'c')
      .map(i => `${i.name}${i.unique ? ' UNIQUE' : ''} (${db.prepare(`PRAGMA index_info(${i.name})`).all().map(c => c.name).join(', ')})`)
      .sort()
    out[name] = { columns, indexes }
  }
  return out
}

function load(sqls) {
  const db = new DatabaseSync(':memory:')
  for (const sql of sqls) db.exec(sql)
  return db
}

test('migration files are numbered 0001, 0002, … with no gaps or duplicates', () => {
  assert.ok(files.length > 0)
  files.forEach((f, i) => {
    assert.match(f, /^\d{4}_[a-z0-9_]+\.sql$/, `${f}: name it NNNN_snake_case.sql (pnpm db:new does)`)
    assert.equal(Number(f.slice(0, 4)), i + 1, `${f}: expected number ${String(i + 1).padStart(4, '0')}`)
  })
})

test('replaying every migration yields exactly the schema.sql snapshot', () => {
  const fromMigrations = shape(load(files.map(f => readFileSync(join(DIR, f), 'utf8'))))
  const fromSchema = shape(load([readFileSync('server/database/schema.sql', 'utf8')]))
  assert.deepEqual(fromMigrations, fromSchema)
})

test('the baseline is a no-op on a database that already has the schema', () => {
  // The existing main/demo databases predate the ledger: the first `migrations apply` runs the
  // baseline against them, so it must neither fail nor change anything.
  const db = load([readFileSync('server/database/schema.sql', 'utf8')])
  const before = shape(db)
  db.exec(readFileSync(join(DIR, files[0]), 'utf8'))
  assert.deepEqual(shape(db), before)
})
