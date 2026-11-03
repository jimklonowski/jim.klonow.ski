// The delete-and-log transaction and the thread restore (server/utils/audit.ts, audit #43 item
// 44), against the REAL schema in node:sqlite. The server utils need h3's auto-imports; what is
// testable here is the SQL the batch runs, built the way auditedDelete and restoreAudit build it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { restoreUpsertSql } from '../shared/utils/auditRestore.ts'

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
const fresh = () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(schema)
  return db
}
const auditInsert = db => db.prepare(`INSERT INTO audit_log (at, action, table_name, row_key, summary, before) VALUES (?1, 'delete', ?2, ?3, ?4, ?5)`)

test('a delete and its log entry land together — a failing log entry rolls the delete back', () => {
  const db = fresh()
  db.prepare(`INSERT INTO vials (id, compound, vial_amount, vial_unit, form, quantity, status, created_at) VALUES (7, 'hCG', 10000, 'iu', 'vial', 1, 'sealed', '2026-10-01')`).run()
  const before = { ...db.prepare('SELECT * FROM vials WHERE id = 7').get() }
  // The batch as one transaction: DELETE, then the audit INSERT.
  db.exec('BEGIN')
  db.prepare('DELETE FROM vials WHERE id = ?1').run(7)
  auditInsert(db).run(new Date().toISOString(), 'vials', '7', 'hCG 10000 iu', JSON.stringify(before))
  db.exec('COMMIT')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vials').get().n, 0)
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE table_name = 'vials' AND row_key = '7' AND action = 'delete'`).get().n, 1)
  // The same batch with a log entry that cannot be written (NOT NULL `at`): nothing is deleted.
  db.prepare(`INSERT INTO vials (id, compound, vial_amount, vial_unit, form, quantity, status, created_at) VALUES (8, 'HGH', 10, 'mg', 'vial', 1, 'sealed', '2026-10-01')`).run()
  db.exec('BEGIN')
  db.prepare('DELETE FROM vials WHERE id = ?1').run(8)
  assert.throws(() => auditInsert(db).run(null, 'vials', '8', 'HGH', '{}'), /NOT NULL/)
  db.exec('ROLLBACK')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vials WHERE id = 8').get().n, 1, 'the delete was rolled back with the failed log entry')
})

test('a deleted ask thread restores with every turn, by the messages folded into its before-image', () => {
  const db = fresh()
  db.prepare(`INSERT INTO ask_threads (id, title, created_at, updated_at) VALUES (3, 'Hct and iron', '2026-10-01T00:00:00Z', '2026-10-01T00:10:00Z')`).run()
  db.prepare(`INSERT INTO ask_messages (id, thread_id, role, content, model, created_at) VALUES (10, 3, 'user', 'Why is Hct up?', NULL, '2026-10-01T00:00:00Z'), (11, 3, 'assistant', 'Because…', 'claude-sonnet-5-5', '2026-10-01T00:10:00Z')`).run()
  const messages = db.prepare('SELECT id, role, content, model, created_at FROM ask_messages WHERE thread_id = 3 ORDER BY id').all().map(m => ({ ...m }))
  const thread = { ...db.prepare('SELECT * FROM ask_threads WHERE id = 3').get() }
  const before = { ...thread, messages }
  // The delete, as threads/delete.post.ts batches it.
  db.exec('BEGIN')
  db.prepare('DELETE FROM ask_messages WHERE thread_id = 3').run()
  db.prepare('DELETE FROM ask_threads WHERE id = 3').run()
  auditInsert(db).run(new Date().toISOString(), 'ask_threads', '3', 'ask: Hct and iron (2 turns)', JSON.stringify(before))
  db.exec('COMMIT')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ask_messages').get().n, 0)
  // The restore, as restoreAudit builds it: the thread row by upsert, then each turn with its id.
  const target = JSON.parse(db.prepare(`SELECT before FROM audit_log WHERE table_name = 'ask_threads'`).get().before)
  const known = new Set(db.prepare('PRAGMA table_info(ask_threads)').all().map(c => c.name))
  const cols = Object.keys(target).filter(c => known.has(c))
  assert.ok(!cols.includes('messages'), 'messages is not a column and is not written as one')
  db.exec('BEGIN')
  db.prepare(restoreUpsertSql('ask_threads', 'id', cols)).run(...cols.map(c => target[c] ?? null))
  for (const m of target.messages) db.prepare('INSERT INTO ask_messages (id, thread_id, role, content, model, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').run(m.id, 3, m.role, m.content, m.model ?? null, m.created_at)
  db.exec('COMMIT')
  assert.deepEqual(db.prepare('SELECT id, role, content, model FROM ask_messages WHERE thread_id = 3 ORDER BY id').all().map(m => ({ ...m })), [
    { id: 10, role: 'user', content: 'Why is Hct up?', model: null },
    { id: 11, role: 'assistant', content: 'Because…', model: 'claude-sonnet-5-5' }
  ])
  assert.equal(db.prepare('SELECT title FROM ask_threads WHERE id = 3').get().title, 'Hct and iron')
})
