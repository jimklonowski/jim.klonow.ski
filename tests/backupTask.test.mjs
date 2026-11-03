// The weekly db:backup task end to end (server/tasks/db/backup.ts) over a fake R2 bucket and a
// real SQLite snapshot — audit #43 item 46: a backup counts only once it is verified (restore
// SQL builds, nothing collapsed against the previous backup, the stored bytes read back exact),
// and the prune of older copies waits for that.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { BACKUP_VERSION, isBackedUpTable, toBackupTable } from '../shared/utils/backup.ts'
import { localToday } from '../shared/utils/time.ts'

// The task's Nitro globals.
class TaskFailure extends Error {
  constructor(message, result) {
    super(message)
    this.name = 'TaskFailure'
    this.result = result
  }
}
let source
globalThis.TaskFailure = TaskFailure
globalThis.defineTask = t => t
globalThis.runLoggedTask = (event, _name, fn) => fn(event.env)
globalThis.errorMessage = err => err instanceof Error ? err.message : String(err)
globalThis.snapshotDatabase = async () => {
  const backup = snapshot(source)
  return { backup, rows: Object.values(backup.tables).reduce((n, t) => n + t.rows.length, 0) }
}
const task = (await import('../server/tasks/db/backup.ts')).default

const DIR = 'server/database/migrations'
function migrated() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const f of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(DIR, f), 'utf8'))
  return db
}
const all = (db, sql) => db.prepare(sql).all().map(r => ({ ...r }))
function snapshot(db) {
  const names = all(db, `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).map(t => t.name).filter(isBackedUpTable)
  const tables = {}
  for (const name of names) tables[name] = toBackupTable(all(db, `SELECT * FROM ${name}`), all(db, `PRAGMA table_info(${name})`).map(c => c.name))
  return { version: BACKUP_VERSION, created_at: '2026-11-03T08:00:00.000Z', database: 'test', migrations: [], tables }
}
function seeded(journalDays = 40) {
  const db = migrated()
  const insert = db.prepare('INSERT INTO journal_entries (date, weight_lbs) VALUES (?, 181)')
  for (let i = 1; i <= journalDays; i++) insert.run(new Date(Date.UTC(2026, 8, i)).toISOString().slice(0, 10))
  db.exec(`INSERT INTO ask_threads (id, title, created_at, updated_at) VALUES (1, 'Hct', 'a', 'b')`)
  return db
}

/** Enough of R2 for the task: put/head/get/list(prefix, delimiter)/delete, with the metadata kept. */
function fakeBucket() {
  const store = new Map()
  return {
    store,
    deleted: [],
    corruptReads: false,
    async put(key, body, opts) {
      store.set(key, { bytes: new Uint8Array(body), customMetadata: opts?.customMetadata ?? {} })
    },
    async head(key) {
      const o = store.get(key)
      return o ? { key, customMetadata: o.customMetadata } : null
    },
    async get(key) {
      const o = store.get(key)
      if (!o) return null
      const bytes = this.corruptReads ? o.bytes.slice(0, o.bytes.length - 8) : o.bytes
      return { key, body: new Blob([bytes]).stream() }
    },
    async list({ prefix = '', delimiter } = {}) {
      const objects = []
      const prefixes = new Set()
      for (const key of store.keys()) {
        if (!key.startsWith(prefix)) continue
        const rest = key.slice(prefix.length)
        if (delimiter && rest.includes(delimiter)) {
          prefixes.add(prefix + rest.slice(0, rest.indexOf(delimiter) + 1))
          continue
        }
        objects.push({ key })
      }
      return { objects, delimitedPrefixes: [...prefixes], truncated: false }
    },
    async delete(keys) {
      for (const k of [].concat(keys)) {
        store.delete(k)
        this.deleted.push(k)
      }
    }
  }
}

const PREFIX = 'backups/d1/jim-klonow-ski-db/'
const TODAY = `${PREFIX}${localToday()}.json.gz`
const run = bucket => task.run({ env: { DB: {}, LABS_BUCKET: bucket } })
/** The w-th Sunday of 2026. */
const week = w => new Date(Date.UTC(2026, 0, 4 + 7 * (w - 1))).toISOString().slice(0, 10)
/** A previous week's object, with what the task now records about one. */
const plant = (bucket, date, counts, extra = {}) => bucket.store.set(`${PREFIX}${date}.json.gz`, { bytes: new Uint8Array(), customMetadata: { tables: '2', rows: String(Object.values(counts).reduce((a, b) => a + b, 0)), counts: JSON.stringify(counts), ...extra } })

test('the first backup: written, read back, counts stored, nothing to compare or prune', async () => {
  source = seeded()
  const bucket = fakeBucket()
  const r = await run(bucket)
  assert.equal(r.key, TODAY)
  assert.equal(r.previous, null)
  assert.equal(r.pruned, 0)
  assert.ok(r.statements > 0, 'the restore SQL was built')
  const meta = bucket.store.get(TODAY).customMetadata
  assert.equal(meta.rows, '41')
  assert.equal(JSON.parse(meta.counts).journal_entries, 40)
  assert.equal(JSON.parse(meta.counts).ask_threads, 1)
})

test('a normal week prunes to the newest 12, oldest first, only after verifying', async () => {
  source = seeded(42)
  const bucket = fakeBucket()
  for (let w = 1; w <= 12; w++) plant(bucket, week(w), { journal_entries: 40, ask_threads: 1 })
  const r = await run(bucket)
  assert.equal(r.previous, `${PREFIX}${week(12)}.json.gz`)
  assert.equal(r.pruned, 1)
  assert.deepEqual(bucket.deleted, [`${PREFIX}${week(1)}.json.gz`])
  assert.equal(bucket.store.size, 12)
  assert.ok(bucket.store.has(TODAY))
})

test('a collapse goes to suspect/, fails the run with the key, and prunes nothing', async () => {
  source = seeded(3) // last week had 40 journal days
  const bucket = fakeBucket()
  for (let w = 1; w <= 12; w++) plant(bucket, week(w), { journal_entries: 40, ask_threads: 1 })
  const err = await run(bucket).catch(e => e)
  assert.ok(err instanceof TaskFailure, 'the run fails so /api/health shows it')
  assert.match(err.message, /journal_entries: 40 → 3 rows/)
  assert.equal(err.result.key, `${PREFIX}suspect/${localToday()}.json.gz`)
  assert.ok(bucket.store.has(err.result.key), 'the copy is still written')
  assert.deepEqual(bucket.deleted, [], 'no good copy aged out')
  assert.equal(bucket.store.size, 13)

  // Next week the suspect copy is not the baseline: the same 3 rows against last good week's 40 still fails.
  const again = await run(bucket).catch(e => e)
  assert.equal(again.result.previous, `${PREFIX}${week(12)}.json.gz`)
  assert.ok(again instanceof TaskFailure)
})

test('a previous backup that recorded only a total is compared by total', async () => {
  source = seeded(40)
  const bucket = fakeBucket()
  bucket.store.set(`${PREFIX}2026-11-01.json.gz`, { bytes: new Uint8Array(), customMetadata: { tables: '21', rows: '4283' } })
  const err = await run(bucket).catch(e => e)
  assert.match(err.message, /total: 4283 → 41 rows/)

  bucket.store.get(`${PREFIX}2026-11-01.json.gz`).customMetadata.rows = '60'
  bucket.store.delete(err.result.key)
  const r = await run(bucket)
  assert.equal(r.pruned, 0)
  assert.equal(r.key, TODAY)
})

test('a row the restore SQL cannot carry fails the backup now, not at restore', async () => {
  source = seeded()
  source.prepare(`INSERT INTO ask_threads (id, title, created_at, updated_at) VALUES (2, ?, 'a', 'b')`).run('x'.repeat(100_000))
  const bucket = fakeBucket()
  plant(bucket, '2026-10-25', { journal_entries: 40, ask_threads: 1 })
  const err = await run(bucket).catch(e => e)
  assert.ok(err instanceof TaskFailure)
  assert.match(err.message, /not restorable: a ask_threads row alone exceeds 90000 bytes/)
  assert.equal(err.result.key, TODAY, 'nothing collapsed, so it is a regular copy — just an unverified one')
  assert.equal(err.result.statements, 0)
  assert.deepEqual(bucket.deleted, [])
})

test('a stored object that does not read back as the snapshot fails the run', async () => {
  source = seeded()
  const bucket = fakeBucket()
  bucket.corruptReads = true
  const err = await run(bucket).catch(e => e)
  assert.ok(err instanceof TaskFailure)
  assert.match(err.message, /read-back/)
})
