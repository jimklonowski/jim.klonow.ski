import type { H3Event } from 'h3'
import type { AuditEntry } from '#shared/types/audit'

// The write audit log (audit_log, migration 0003). Each owner write to a tracked table records
// the row as it was BEFORE the write, which is what makes deletes and overwrites recoverable:
// /tools/data lists the history and puts any entry's before-image back. That replaces a
// `deleted_at` column on every table — soft delete would have meant filtering every read the
// digests, the ask context and the trends make, where one missed WHERE would resurrect data.
//
// Only owner writes are logged. Demo sessions write to the sandbox (reset nightly); the webhook,
// Whoop sync and digests are machines re-deriving data that has its own source. A logging
// failure never fails the write it describes.

/** Tracked tables and their primary key column. Restore touches nothing outside this list. */
export const AUDIT_KEYS = {
  journal_entries: 'date',
  labs_entries: 'date',
  dexa_entries: 'date',
  supplements: 'id',
  vials: 'id',
  vaccinations: 'id',
  cycles: 'id',
  progress_photos: 'id',
  profile: 'key'
} as const

export type AuditTable = keyof typeof AUDIT_KEYS
export type AuditAction = AuditEntry['action']

type Row = Record<string, unknown>

function auditing(event: H3Event): boolean {
  return getAuth(event)?.role === 'owner'
}

async function currentRow(db: D1Database, table: AuditTable, key: string | number): Promise<Row | null> {
  return db.prepare(`SELECT * FROM ${table} WHERE ${AUDIT_KEYS[table]} = ?1`).bind(key).first<Row>()
}

/** The row as it stands, read just before a write changes it. Null when absent or not auditing. */
export async function auditBefore(event: H3Event, table: AuditTable, key: string | number | null | undefined): Promise<Row | null> {
  if (!auditing(event) || key == null) return null
  try {
    return await currentRow(getDb(event), table, key)
  }
  catch (err) {
    console.error(`audit: could not read ${table} ${key}:`, err instanceof Error ? err.message : err)
    return null
  }
}

interface AuditWrite {
  table: AuditTable
  key: string | number
  before: Row | null
  summary: string
  deleted?: boolean
}

/**
 * Logs a write that has just happened. `before` is what auditBefore returned; the action follows
 * from it (no before = create) unless `deleted` says the row is gone.
 */
export async function recordAudit(event: H3Event, entry: AuditWrite): Promise<void> {
  const stmt = auditStatement(event, entry)
  if (!stmt) return
  try {
    await stmt.run()
  }
  catch (err) {
    console.error(`audit: could not record write on ${entry.table} ${entry.key}:`, err instanceof Error ? err.message : err)
  }
}

/**
 * The same log entry as a prepared statement, for a handler that must commit its write and its
 * audit row in one db.batch — the photo delete uses this, where a logged-nowhere delete would
 * mean files the purge task never collects AND an undo that never existed. Null when the session
 * isn't audited.
 */
export function auditStatement(event: H3Event, entry: AuditWrite): D1PreparedStatement | null {
  if (!auditing(event)) return null
  const action: AuditAction = entry.deleted ? 'delete' : entry.before ? 'update' : 'create'
  return insertAudit(getDb(event), action, entry.table, entry.key, entry.before, entry.summary)
}

function insertAudit(db: D1Database, action: AuditAction, table: AuditTable, key: string | number, before: Row | null, summary: string): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO audit_log (at, action, table_name, row_key, summary, before)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `).bind(new Date().toISOString(), action, table, String(key), summary.slice(0, 200), before ? JSON.stringify(before) : null)
}

// --- history + restore ---

interface AuditRow {
  id: number
  at: string
  action: AuditAction
  table_name: string
  row_key: string
  summary: string | null
  before: string | null
  restored_at: string | null
  purged_at: string | null
}

function blockedReason(row: AuditRow, purgedPhotos?: ReadonlySet<string>): string | null {
  if (row.restored_at) return 'already restored'
  if (!(row.table_name in AUDIT_KEYS)) return 'not a restorable table'
  // Undoing an upload means removing its files too; the photos page's delete does that.
  if (row.table_name === 'progress_photos' && row.action === 'create') return 'delete it from the photos page'
  // Once ANY entry for a photo is purged its files are gone, so every entry that would put the
  // row back (an old reframe, a flip) is dead too — not just the delete entry that was marked.
  if (row.purged_at || (row.table_name === 'progress_photos' && purgedPhotos?.has(row.row_key))) {
    return 'its files were removed after 30 days'
  }
  return null
}

// Explicit columns: `before` is the full row snapshot (a labs row carries its AI summary), and
// the list reads up to 500 entries only to show metadata.
const LIST_COLUMNS = 'id, at, action, table_name, row_key, summary, restored_at, purged_at'

export async function listAudit(db: D1Database, limit: number, before?: number): Promise<AuditEntry[]> {
  const [entriesRes, purgedRes] = await db.batch([
    before == null
      ? db.prepare(`SELECT ${LIST_COLUMNS} FROM audit_log ORDER BY id DESC LIMIT ?1`).bind(limit)
      : db.prepare(`SELECT ${LIST_COLUMNS} FROM audit_log WHERE id < ?2 ORDER BY id DESC LIMIT ?1`).bind(limit, before),
    db.prepare(`SELECT DISTINCT row_key FROM audit_log WHERE table_name = 'progress_photos' AND purged_at IS NOT NULL`)
  ])
  const purgedPhotos = new Set(((purgedRes?.results ?? []) as Array<{ row_key: string }>).map(r => r.row_key))
  return (((entriesRes?.results ?? []) as AuditRow[])).map(r => ({
    id: r.id,
    at: r.at,
    action: r.action,
    table: r.table_name,
    key: r.row_key,
    summary: r.summary,
    restoredAt: r.restored_at,
    blocked: blockedReason(r, purgedPhotos)
  }))
}

/**
 * Puts an entry's before-image back: re-inserts a deleted row, reverts an update (later edits to
 * that row are overwritten — the restore is logged, so it can be undone in turn), or removes a
 * row the entry created. The restore itself becomes a new entry holding what it replaced — and
 * when the restore's effect IS a delete, it's logged as one, so a photo removed this way still
 * enters the purge task's `action = 'delete'` scan instead of its files living in R2 forever.
 * `photos` is the photos bucket, for refusing to resurrect a row whose files are already gone.
 */
export async function restoreAudit(db: D1Database, id: number, photos: R2Bucket): Promise<{ table: string, key: string }> {
  const row = await db.prepare('SELECT * FROM audit_log WHERE id = ?1').bind(id).first<AuditRow>()
  if (!row) throw createError({ statusCode: 404, message: 'No such history entry' })

  // The list blocks photo entries once any entry for that photo is purged; enforce it here too.
  const purged = row.table_name === 'progress_photos'
    ? await db.prepare(`SELECT 1 FROM audit_log WHERE table_name = 'progress_photos' AND row_key = ?1 AND purged_at IS NOT NULL`).bind(row.row_key).first()
    : null
  const blocked = blockedReason(row, purged ? new Set([row.row_key]) : undefined)
  if (blocked) throw createError({ statusCode: 409, message: `Can't restore: ${blocked}` })

  const table = row.table_name as AuditTable
  const keyCol = AUDIT_KEYS[table]
  const target = row.before ? JSON.parse(row.before) as Row : null
  const now = await currentRow(db, table, row.row_key)

  let write: D1PreparedStatement
  if (!target) {
    // The entry created the row (or a restore re-created it): restoring removes it.
    if (!now) throw createError({ statusCode: 409, message: 'Can\'t restore: that row is already gone' })
    write = db.prepare(`DELETE FROM ${table} WHERE ${keyCol} = ?1`).bind(row.row_key)
  }
  else {
    if (row.action === 'delete' && now) {
      throw createError({ statusCode: 409, message: 'Can\'t restore: a row with the same key exists now' })
    }
    // Re-creating a photo row is only meaningful while its files still exist — the purge marks
    // the delete entry it collects, but an older reframe/flip entry could otherwise resurrect a
    // row whose image is long gone.
    if (table === 'progress_photos' && !now && typeof target.r2_key === 'string') {
      const file = await photos.head(target.r2_key)
      if (!file) throw createError({ statusCode: 409, message: 'Can\'t restore: its files were removed after 30 days' })
    }
    // Only columns the table still has — the schema may have moved on since the entry was written.
    const { results: info } = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
    const known = new Set((info ?? []).map(c => c.name))
    const cols = Object.keys(target).filter(c => known.has(c))
    if (!cols.includes(keyCol)) throw createError({ statusCode: 409, message: 'Can\'t restore: the saved row has no key' })
    write = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')})`)
      .bind(...cols.map(c => target[c] ?? null))
  }

  // One transaction: the row change, the log of what it replaced, and the entry marked done.
  // A deleting restore is logged as a delete (with the removed row as its before-image): same
  // undo semantics, and the photo purge task recognizes it.
  const at = new Date().toISOString()
  const logAction: AuditAction = target ? 'restore' : 'delete'
  const summary = `${target ? 'restored' : 'undid'} #${row.id}: ${row.summary ?? ''}`.slice(0, 200)
  await db.batch([
    write,
    db.prepare(`
      INSERT INTO audit_log (at, action, table_name, row_key, summary, before)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `).bind(at, logAction, table, row.row_key, summary, now ? JSON.stringify(now) : null),
    db.prepare('UPDATE audit_log SET restored_at = ?2 WHERE id = ?1').bind(row.id, at)
  ])
  return { table, key: row.row_key }
}
