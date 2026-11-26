// Keeps the two descriptions of the database in step: server/database/migrations (what
// `wrangler d1 migrations apply` actually runs, in order, recorded in each database's
// d1_migrations ledger) and server/database/schema.sql (the commented snapshot people read).
// Both are loaded into in-memory SQLite (node:sqlite, the same engine D1 runs) and compared
// column by column, index by index and constraint by constraint, so a migration without its
// schema.sql edit — or the reverse — fails here instead of on a fresh database months later.
//
// Constraints were not compared until audit #44 item 56: a foreign key, an in-table UNIQUE or a
// CHECK could differ between the two, or vanish from both, unnoticed — and the app leans on
// each (a deleted thread takes its messages by ON DELETE CASCADE; a goal saved against a
// deleted cycle is a 409 because the foreign key refuses it; the workouts upsert conflicts on
// the UNIQUE external_id). The last tests here run those against the migrated database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { isForeignKeyError } from '../server/utils/db.ts'

const DIR = 'server/database/migrations'
const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()

/** The CHECK clauses in a stored CREATE TABLE text, whitespace flattened — SQLite has no pragma for them. */
function checksOf(sql) {
  const text = sql.replace(/--[^\n]*/g, '')
  const out = []
  for (const m of text.matchAll(/\bCHECK\s*\(/gi)) {
    let depth = 1
    let i = m.index + m[0].length
    while (i < text.length && depth) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') depth--
      i++
    }
    out.push(text.slice(m.index, i).replace(/\s+/g, ' ').replace(/CHECK\s*\(/i, 'CHECK ('))
  }
  return out.sort()
}

// Tables, columns, indexes and constraints — what the app's SQL depends on. Raw
// sqlite_master.sql can't be compared: an ALTER TABLE ADD COLUMN reformats the stored CREATE text.
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
    // Declared in the table, so absent from the CREATE INDEX list above: a PRIMARY KEY that is
    // not the rowid (in key order) and every UNIQUE.
    const keys = db.prepare(`PRAGMA index_list(${name})`).all()
      .filter(i => i.origin !== 'c')
      .map(i => `${i.origin === 'pk' ? 'PRIMARY KEY' : 'UNIQUE'} (${db.prepare(`PRAGMA index_info(${i.name})`).all().map(c => c.name).join(', ')})`)
      .sort()
    // What a row points at, and what happens to it when that row goes.
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${name})`).all()
      .map(f => `${f.from} → ${f.table}(${f.to ?? 'its primary key'}) ON DELETE ${f.on_delete} ON UPDATE ${f.on_update}`)
      .sort()
    const checks = checksOf(db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name).sql)
    out[name] = { columns, indexes, keys, foreignKeys, checks }
  }
  return out
}

// Foreign keys enforced while the files run, as D1 enforces them.
function load(sqls) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const sql of sqls) db.exec(sql)
  return db
}

const SCHEMA = readFileSync('server/database/schema.sql', 'utf8')
const migrated = () => load(files.map(f => readFileSync(join(DIR, f), 'utf8')))

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
  // baseline against them, so it must neither fail nor change anything. A table the baseline
  // created and a later migration dropped (supplements, 0014) is the one thing it may add back
  // to today's snapshot, which never had it.
  const dropped = new Set(files.flatMap(f => [...readFileSync(join(DIR, f), 'utf8').matchAll(/DROP TABLE IF EXISTS (\w+)/g)].map(m => m[1])))
  const db = load([readFileSync('server/database/schema.sql', 'utf8')])
  const before = shape(db)
  db.exec(readFileSync(join(DIR, files[0]), 'utf8'))
  const after = shape(db)
  for (const name of dropped) delete after[name]
  assert.deepEqual(after, before)
})

// ── constraints (audit #44 item 56) ──────────────────────────────────────────

test('the comparison sees a foreign key, what its delete does, a UNIQUE and a CHECK', () => {
  // Each edit is one a hand could make to schema.sql alone. Before item 56 none of them failed
  // the comparison above: columns and CREATE INDEXes were all it looked at.
  const snapshot = shape(load([SCHEMA]))
  const edits = {
    'a foreign key dropped': [' REFERENCES ask_threads(id) ON DELETE CASCADE', ''],
    'CASCADE turned into SET NULL': ['REFERENCES protocol_items(id) ON DELETE CASCADE', 'REFERENCES protocol_items(id) ON DELETE SET NULL'],
    'SET NULL dropped': ['REFERENCES cycles(id) ON DELETE SET NULL', 'REFERENCES cycles(id)'],
    'a UNIQUE dropped': ['external_id TEXT UNIQUE', 'external_id TEXT'],
    'a CHECK dropped': ['id INTEGER PRIMARY KEY CHECK (id = 1)', 'id INTEGER PRIMARY KEY']
  }
  for (const [what, [from, to]] of Object.entries(edits)) {
    assert.ok(SCHEMA.includes(from), `${what}: schema.sql still reads "${from}"`)
    assert.notDeepEqual(shape(load([SCHEMA.replace(from, to)])), snapshot, what)
  }
})

test('every foreign key points at a key that exists', () => {
  // A REFERENCES naming a column that is neither the parent's primary key nor UNIQUE is accepted
  // by CREATE TABLE and then fails every write to either table ("foreign key mismatch").
  const db = migrated()
  let seen = 0
  for (const [name, table] of Object.entries(shape(db))) {
    for (const fk of db.prepare(`PRAGMA foreign_key_list(${name})`).all()) {
      seen++
      const parent = db.prepare(`PRAGMA table_info(${fk.table})`).all()
      assert.ok(parent.length, `${name}.${fk.from}: no table ${fk.table}`)
      const target = fk.to ?? parent.find(c => c.pk)?.name
      const isKey = parent.some(c => c.name === target && c.pk)
        || db.prepare(`PRAGMA index_list(${fk.table})`).all().some(i => i.unique && db.prepare(`PRAGMA index_info(${i.name})`).all().map(c => c.name).join() === target)
      assert.ok(isKey, `${name}.${fk.from} → ${fk.table}(${target}): not a primary key or UNIQUE column`)
    }
    assert.ok(Array.isArray(table.foreignKeys))
  }
  assert.equal(seen, 3, 'ask_messages → ask_threads, protocol_versions → protocol_items, marker_goals → cycles')
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
})

test('deleting a parent does what the code counts on, on the migrated database', () => {
  const db = migrated()
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
  const count = sql => db.prepare(sql).get().n

  // A thread takes its messages (threads/delete relies on it, and folds them into the undo image first).
  db.exec(`INSERT INTO ask_threads (id, title, created_at, updated_at) VALUES (1, 'kept', 'x', 'x'), (2, 'deleted', 'x', 'x')`)
  db.exec(`INSERT INTO ask_messages (thread_id, role, content, created_at) VALUES (1, 'user', 'a', 'x'), (2, 'user', 'b', 'x'), (2, 'assistant', 'c', 'x')`)
  db.exec('DELETE FROM ask_threads WHERE id = 2')
  assert.equal(count('SELECT COUNT(*) AS n FROM ask_messages'), 1)
  assert.equal(count('SELECT COUNT(*) AS n FROM ask_messages WHERE thread_id = 1'), 1, 'the other thread\'s turns are untouched')

  // A protocol item takes its versions.
  db.exec(`INSERT INTO protocol_items (id, name, kind, category, created_at) VALUES (1, 'hCG', 'scheduled', 'compound', 'x'), (2, 'Zinc', 'standing', 'supplement', 'x')`)
  db.exec(`INSERT INTO protocol_versions (item_id, from_date, dose_label, created_at) VALUES (1, '2026-01-01', '500 IU', 'x'), (1, '2026-10-24', '250 IU', 'x'), (2, NULL, '30 mg', 'x')`)
  db.exec('DELETE FROM protocol_items WHERE id = 1')
  assert.equal(count('SELECT COUNT(*) AS n FROM protocol_versions'), 1)

  // A goal outlives the cycle it gated, pointing at nothing.
  db.exec(`INSERT INTO cycles (id, name, start_date, planned_weeks, created_at) VALUES (5, 'Primo', '2027-03-01', 16, 'x')`)
  db.exec(`INSERT INTO marker_goals (id, marker, comparator, target, cycle_id, stated, created_at) VALUES (1, 'hematocrit', '<', 50, 5, '2026-10-23', 'x')`)
  db.exec('DELETE FROM cycles WHERE id = 5')
  assert.deepEqual({ ...db.prepare('SELECT marker, cycle_id FROM marker_goals WHERE id = 1').get() }, { marker: 'hematocrit', cycle_id: null })
})

test('a row pointing at nothing is refused, and the refusal is the error the goal form reports as a 409', () => {
  const db = migrated()
  let refused
  try {
    db.exec(`INSERT INTO marker_goals (marker, comparator, target, cycle_id, stated, created_at) VALUES ('hematocrit', '<', 50, 99, '2026-10-23', 'x')`)
  }
  catch (err) {
    refused = err
  }
  assert.ok(refused, 'no cycle 99: the insert must fail')
  assert.equal(isForeignKeyError(refused), true, refused.message)
  assert.equal(isForeignKeyError(new Error('D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT')), true, 'as D1 words it')
  assert.equal(isForeignKeyError(new Error('UNIQUE constraint failed: workouts.external_id')), false)
  assert.throws(() => db.exec(`INSERT INTO ask_messages (thread_id, role, content, created_at) VALUES (99, 'user', 'a', 'x')`), /FOREIGN KEY/)
  assert.throws(() => db.exec(`INSERT INTO protocol_versions (item_id, created_at) VALUES (99, 'x')`), /FOREIGN KEY/)
})

test('the single-row and one-per-key tables hold on the migrated database', () => {
  const db = migrated()
  db.exec(`INSERT INTO whoop_tokens (id, access_token, refresh_token, expires_at) VALUES (1, 'a', 'r', 0)`)
  assert.throws(() => db.exec(`INSERT INTO whoop_tokens (id, access_token, refresh_token, expires_at) VALUES (2, 'a', 'r', 0)`), /CHECK/, 'one Whoop connection')
  db.exec(`INSERT INTO workouts (external_id, date) VALUES ('whoop:1', '2026-11-01')`)
  assert.throws(() => db.exec(`INSERT INTO workouts (external_id, date) VALUES ('whoop:1', '2026-11-02')`), /UNIQUE/, 'the upsert\'s conflict target')
  db.exec(`INSERT INTO workouts (external_id, date) VALUES (NULL, '2026-11-01'), (NULL, '2026-11-01')`)
})
