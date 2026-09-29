// The weekly backup's round trip (shared/utils/backup.ts): rows read out of a real SQLite
// database with the site's schema, turned into the backup format, restored as SQL into another
// database, and read back identical. This is the only rehearsal a restore gets before it's
// needed, so it exercises the failure modes found 2026-09-29: the ask_messages → ask_threads
// foreign key (restore order + ON DELETE CASCADE), D1's 100 KB statement cap, and a restore
// resurrecting revoked share links.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  BACKUP_VERSION, RESTORE_PARENTS, backupToSql, backupToSqlStatements,
  isBackedUpTable, orderForRestore, toBackupTable
} from '../shared/utils/backup.ts'

const DIR = 'server/database/migrations'
function migrated() {
  // Foreign keys explicitly on: D1 enforces them, so the rehearsal must too.
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const f of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(DIR, f), 'utf8'))
  return db
}

// Plain objects: node:sqlite returns null-prototype rows, which deepEqual treats as different.
const all = (db, sql) => db.prepare(sql).all().map(r => ({ ...r }))

function snapshot(db) {
  const names = all(db, `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).map(t => t.name).filter(isBackedUpTable)
  const tables = {}
  for (const name of names) {
    const columns = all(db, `PRAGMA table_info(${name})`).map(c => c.name)
    tables[name] = toBackupTable(all(db, `SELECT * FROM ${name}`), columns)
  }
  return { version: BACKUP_VERSION, created_at: '2026-09-27T08:00:00.000Z', database: 'test', migrations: ['0001_baseline.sql'], tables }
}

function seedSource() {
  const source = migrated()
  source.exec(`
    INSERT INTO journal_entries (date, weight_lbs, peptides, notes) VALUES
      ('2026-09-20', 181.4, '[{"compound":"HGH","dose":2.5,"unit":"iu"}]', 'Jim''s "rough" night; 2nd line' || char(10) || 'more'),
      ('2026-09-21', NULL, '[]', NULL);
    INSERT INTO supplements (name, dose, notes, sort, created_at) VALUES ('Mg', '400 mg', 'it''s fine -- really', 3, '2026-09-01T00:00:00Z');
    INSERT INTO vials (compound, vial_amount, cost, created_at) VALUES ('BPC-157', 5, 0.1 + 0.2, 'x');
    INSERT INTO ask_threads (id, title, created_at, updated_at) VALUES
      (1, 'Hematocrit creep', '2026-09-25T10:00:00Z', '2026-09-25T10:01:00Z'),
      (2, 'Ferritin retest timing', '2026-09-26T10:00:00Z', '2026-09-26T10:03:00Z');
    INSERT INTO ask_messages (thread_id, role, content, model, created_at) VALUES
      (1, 'user', 'how concerned should I be?', NULL, '2026-09-25T10:00:30Z'),
      (1, 'assistant', 'watch closely, not worry yet', 'claude-sonnet-5-5', '2026-09-25T10:01:00Z'),
      (2, 'user', 'when to retest?', NULL, '2026-09-26T10:03:00Z');
    INSERT INTO invites (id, role, label, created_at, expires_at, max_uses, uses, revoked) VALUES
      ('aa11', 'friend', 'Sam', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 5, 1, 0),
      ('bb22', 'doctor', 'Dr. Patel', '2026-09-10T00:00:00Z', '2026-09-17T00:00:00Z', 1, 1, 0);
    INSERT INTO whoop_tokens (id, access_token, refresh_token, expires_at) VALUES (1, 'secret', 'secret', 0);
  `)
  return source
}

test('a backup restores every row exactly, awkward values and FK tables included', () => {
  const source = seedSource()
  const backup = snapshot(source)
  assert.equal('whoop_tokens' in backup.tables, false, 'OAuth tokens never enter a backup')

  const target = migrated()
  // A target with stale rows of its own: the restore replaces them.
  target.exec(`INSERT INTO journal_entries (date) VALUES ('1999-01-01')`)
  target.exec(backupToSql(backup))

  for (const name of Object.keys(backup.tables)) {
    assert.deepEqual(all(target, `SELECT * FROM ${name}`), all(source, `SELECT * FROM ${name}`), name)
  }
  // AUTOINCREMENT carries on past restored ids instead of reusing them.
  target.exec(`INSERT INTO vials (compound, vial_amount, created_at) VALUES ('X', 1, 'y')`)
  assert.equal(target.prepare('SELECT MAX(id) AS m FROM vials').get().m, 2)
})

test('restoring over a live database: cascades cannot eat /ask history, revocations survive', () => {
  const backup = snapshot(seedSource())

  const live = migrated()
  live.exec(`
    -- A thread that exists only live: replaced by the restore, like any other table's rows.
    INSERT INTO ask_threads (id, title, created_at, updated_at) VALUES (9, 'post-backup thread', 'z', 'z');
    INSERT INTO ask_messages (thread_id, role, content, created_at) VALUES (9, 'user', 'gone after restore', 'z');
    -- The backup's 'aa11' invite, but revoked and further spent SINCE the backup was written.
    INSERT INTO invites (id, role, label, created_at, expires_at, max_uses, uses, revoked) VALUES
      ('aa11', 'friend', 'Sam', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 5, 4, 1),
      -- A link minted after the backup: a restore must not kill it.
      ('cc33', 'friend', 'new link', '2026-09-28T00:00:00Z', '2026-10-28T00:00:00Z', 1, 0, 0);
  `)
  live.exec(backupToSql(backup))

  // The old name-ordered SQL inserted ask_messages first, then DELETE FROM ask_threads cascaded
  // them all away and the restore "succeeded" with zero messages.
  assert.equal(live.prepare('SELECT COUNT(*) AS c FROM ask_messages').get().c, 3)
  assert.equal(live.prepare('SELECT COUNT(*) AS c FROM ask_threads').get().c, 2)

  const invites = Object.fromEntries(all(live, 'SELECT * FROM invites').map(r => [r.id, r]))
  assert.equal(invites.aa11.revoked, 1, 'a restore never un-revokes a link')
  assert.equal(invites.aa11.uses, 4, 'a restore never hands uses back')
  assert.equal(invites.aa11.label, 'Sam')
  assert.ok(invites.bb22, 'backup-only invites are restored')
  assert.ok(invites.cc33, 'links minted after the backup survive')
  assert.equal(invites.cc33.revoked, 0)
})

test('statement order: every DELETE before any INSERT, children deleted first, parents inserted first', () => {
  const statements = backupToSqlStatements(snapshot(seedSource())).filter(s => !s.startsWith('--'))
  const kind = statements.map(s => s.startsWith('DELETE') ? 'D' : 'I').join('')
  assert.match(kind, /^D+I+$/, 'two phases, deletes then inserts')

  const deleteAt = t => statements.findIndex(s => s.startsWith(`DELETE FROM ${t};`))
  const insertAt = t => statements.findIndex(s => s.startsWith(`INSERT INTO ${t} `))
  assert.ok(deleteAt('ask_messages') < deleteAt('ask_threads'), 'child rows deleted before their parent')
  assert.ok(insertAt('ask_threads') < insertAt('ask_messages'), 'parent rows inserted before their children')
  assert.equal(deleteAt('invites'), -1, 'invites are merged, never wiped')
  assert.match(statements[insertAt('invites')], /ON CONFLICT \(id\) DO UPDATE SET .*uses = max\(uses, excluded\.uses\), revoked = max\(revoked, excluded\.revoked\)/s)
})

test('RESTORE_PARENTS matches the real foreign-key graph of the migrations', () => {
  const db = migrated()
  const names = all(db, `SELECT name FROM sqlite_master WHERE type = 'table'`).map(t => t.name).filter(isBackedUpTable)
  const order = orderForRestore(names)
  for (const child of names) {
    for (const fk of all(db, `PRAGMA foreign_key_list(${child})`)) {
      assert.ok((RESTORE_PARENTS[child] ?? []).includes(fk.table),
        `${child} → ${fk.table} is a foreign key the migrations declare; add it to RESTORE_PARENTS in shared/utils/backup.ts`)
      assert.ok(order.indexOf(fk.table) < order.indexOf(child), `${fk.table} must restore before ${child}`)
    }
  }
})

test('no statement exceeds the byte cap; an unsplittable row refuses loudly', () => {
  const source = migrated()
  const big = 'x'.repeat(40_000)
  const insert = source.prepare(`INSERT INTO ask_threads (title, created_at, updated_at) VALUES (?, 'a', 'b')`)
  for (let i = 0; i < 5; i++) insert.run(`${i} ${big}`)

  const cap = 90_000
  const statements = backupToSqlStatements(snapshot(source), cap).filter(s => !s.startsWith('--'))
  const enc = new TextEncoder()
  for (const s of statements) assert.ok(enc.encode(s).length <= cap, `statement of ${enc.encode(s).length} bytes`)
  assert.ok(statements.filter(s => s.startsWith('INSERT INTO ask_threads')).length >= 3, 'big rows split across statements')

  // A restored copy of those big rows is still exact.
  const target = migrated()
  target.exec(backupToSql(snapshot(source), cap))
  assert.deepEqual(all(target, 'SELECT * FROM ask_threads'), all(source, 'SELECT * FROM ask_threads'))

  assert.throws(() => backupToSql(snapshot(source), 10_000), /ask_threads row alone exceeds/)
})

test('the format refuses what it cannot restore faithfully', () => {
  assert.throws(() => toBackupTable([{ blob: new Uint8Array([1]) }], ['blob']), /unsupported value/)
  assert.throws(() => backupToSql({ version: 99, tables: {} }), /unsupported backup version/)
  assert.throws(() => backupToSql({ version: BACKUP_VERSION, created_at: '', database: '', migrations: [], tables: { 'x; DROP TABLE y': { columns: [], rows: [] } } }), /unsafe identifier/)
})
