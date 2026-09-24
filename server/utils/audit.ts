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

/**
 * Logs a write that has just happened. `before` is what auditBefore returned; the action follows
 * from it (no before = create) unless `deleted` says the row is gone.
 */
export async function recordAudit(event: H3Event, entry: {
  table: AuditTable
  key: string | number
  before: Row | null
  summary: string
  deleted?: boolean
}): Promise<void> {
  if (!auditing(event)) return
  const action: AuditAction = entry.deleted ? 'delete' : entry.before ? 'update' : 'create'
  try {
    await insertAudit(getDb(event), action, entry.table, entry.key, entry.before, entry.summary)
  }
  catch (err) {
    console.error(`audit: could not record ${action} on ${entry.table} ${entry.key}:`, err instanceof Error ? err.message : err)
  }
}

function insertAudit(db: D1Database, action: AuditAction, table: AuditTable, key: string | number, before: Row | null, summary: string) {
  return db.prepare(`
    INSERT INTO audit_log (at, action, table_name, row_key, summary, before)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `).bind(new Date().toISOString(), action, table, String(key), summary.slice(0, 200), before ? JSON.stringify(before) : null).run()
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

function blockedReason(row: AuditRow): string | null {
  if (row.restored_at) return 'already restored'
  if (!(row.table_name in AUDIT_KEYS)) return 'not a restorable table'
  // Undoing an upload means removing its files too; the photos page's delete does that.
  if (row.table_name === 'progress_photos' && row.action === 'create') return 'delete it from the photos page'
  if (row.purged_at) return 'its files were removed after 30 days'
  return null
}

export async function listAudit(db: D1Database, limit: number): Promise<AuditEntry[]> {
  const { results } = await db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?1').bind(limit).all<AuditRow>()
  return (results ?? []).map(r => ({
    id: r.id,
    at: r.at,
    action: r.action,
    table: r.table_name,
    key: r.row_key,
    summary: r.summary,
    restoredAt: r.restored_at,
    blocked: blockedReason(r)
  }))
}

/**
 * Puts an entry's before-image back: re-inserts a deleted row, reverts an update (later edits to
 * that row are overwritten — the restore is logged, so it can be undone in turn), or removes a
 * row the entry created. The restore itself becomes a new entry holding what it replaced.
 */
export async function restoreAudit(db: D1Database, id: number): Promise<{ table: string, key: string }> {
  const row = await db.prepare('SELECT * FROM audit_log WHERE id = ?1').bind(id).first<AuditRow>()
  if (!row) throw createError({ statusCode: 404, message: 'No such history entry' })
  const blocked = blockedReason(row)
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
    // Only columns the table still has — the schema may have moved on since the entry was written.
    const { results: info } = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
    const known = new Set((info ?? []).map(c => c.name))
    const cols = Object.keys(target).filter(c => known.has(c))
    if (!cols.includes(keyCol)) throw createError({ statusCode: 409, message: 'Can\'t restore: the saved row has no key' })
    write = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')})`)
      .bind(...cols.map(c => target[c] ?? null))
  }

  // One transaction: the row change, the log of what it replaced, and the entry marked done.
  const at = new Date().toISOString()
  await db.batch([
    write,
    db.prepare(`
      INSERT INTO audit_log (at, action, table_name, row_key, summary, before)
      VALUES (?1, 'restore', ?2, ?3, ?4, ?5)
    `).bind(at, table, row.row_key, `restored #${row.id}: ${row.summary ?? ''}`.slice(0, 200), now ? JSON.stringify(now) : null),
    db.prepare('UPDATE audit_log SET restored_at = ?2 WHERE id = ?1').bind(row.id, at)
  ])
  return { table, key: row.row_key }
}
