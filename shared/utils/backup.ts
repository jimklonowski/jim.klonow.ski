// The weekly D1 backup's format (written by server/tasks/db/backup.ts to R2) and its way back
// in (scripts/restore-backup.mjs → a .sql file for `wrangler d1 execute`). Kept pure and
// import-free so tests/backup.test.mjs round-trips it through real SQLite.
//
// D1 Time Travel already restores the database to any minute of the last 30 days. This covers
// what it can't: a longer history, and a copy that outlives the database itself.

export const BACKUP_VERSION = 1

/** Tables a backup never carries. whoop_tokens is live OAuth credentials (a reconnect replaces
 * them); d1_migrations is recorded separately as `migrations`, and a restore target already has
 * its own; task_runs is operational noise. */
export const BACKUP_EXCLUDED_TABLES = ['whoop_tokens', 'd1_migrations', 'task_runs']

export type BackupValue = string | number | null

export interface BackupTable {
  columns: string[]
  rows: BackupValue[][]
}

export interface Backup {
  version: typeof BACKUP_VERSION
  created_at: string
  database: string
  /** The migrations the database had applied, so a restore target can be built to match. */
  migrations: string[]
  tables: Record<string, BackupTable>
}

/** SQLite's own internal tables and Cloudflare's metadata table, plus the exclusions above. */
export function isBackedUpTable(name: string): boolean {
  return !name.startsWith('sqlite_') && !name.startsWith('_cf_') && !BACKUP_EXCLUDED_TABLES.includes(name)
}

/** D1 row objects → column-ordered arrays (a third the size of repeating every key per row). */
export function toBackupTable(rows: Array<Record<string, unknown>>, columns: string[]): BackupTable {
  return {
    columns,
    rows: rows.map(r => columns.map((c) => {
      const v = r[c]
      if (v == null) return null
      if (typeof v === 'number' || typeof v === 'string') return v
      throw new Error(`unsupported value in column ${c}: ${typeof v}`)
    }))
  }
}

function sqlLiteral(v: BackupValue): string {
  if (v === null) return 'NULL'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`non-finite number ${v}`)
    return String(v)
  }
  return `'${v.replaceAll('\'', '\'\'')}'`
}

const IDENT = /^\w+$/

/**
 * Foreign-key parents, child → parents. Restore order comes from this: parents are inserted
 * before their children and deleted after them, so the SQL works statement by statement — no
 * transaction or deferred-FK pragma to rely on (D1 refuses BEGIN, and node:sqlite's exec
 * autocommits, where a deferral wouldn't help anyway). ON DELETE CASCADE makes ordering doubly
 * important: with the old any-order SQL, `DELETE FROM ask_threads` ran AFTER the messages were
 * restored and silently cascaded them away. tests/backup.test.mjs derives the real FK graph from
 * the migrations and fails if a new foreign key is missing from this map.
 */
export const RESTORE_PARENTS: Record<string, string[]> = {
  ask_messages: ['ask_threads']
}

/** Table order for the INSERT phase: alphabetical, then every parent hoisted before its children. */
export function orderForRestore(names: string[]): string[] {
  const out = [...names].sort()
  for (let pass = 0; pass < out.length; pass++) {
    let moved = false
    for (const [child, parents] of Object.entries(RESTORE_PARENTS)) {
      const c = out.indexOf(child)
      if (c === -1) continue
      for (const parent of parents) {
        const p = out.indexOf(parent)
        if (p > c) {
          out.splice(p, 1)
          out.splice(c, 0, parent)
          moved = true
        }
      }
    }
    if (!moved) break
  }
  return out
}

/**
 * Tables restored by merging instead of DELETE + INSERT, because replacing them wholesale would
 * undo a security action taken after the backup was written: restoring last Sunday's `invites`
 * must not resurrect a link revoked on Tuesday, nor hand a spent one its uses back. `uses` and
 * `revoked` keep whichever value is higher; share links minted after the backup survive.
 */
const MERGE_MAX_COLUMNS: Record<string, string[]> = {
  invites: ['uses', 'revoked']
}

const encoder = new TextEncoder()

/**
 * The backup as SQL that replaces each table's rows. Run against a database already at the
 * backup's schema (`pnpm db:migrate` builds one). Explicit ids are kept, so AUTOINCREMENT
 * counters move past them on their own. Statement shape:
 *   - every DELETE first (children before parents), then every INSERT (parents before children),
 *     so a partial application never leaves a cascade or FK violation behind;
 *   - each INSERT stays under `maxStatementBytes` (D1 rejects statements over 100 KB — a labs
 *     row with an AI summary, a digest, or an audit before-image can blow a naive 50-row batch);
 *   - `invites` is merged, never deleted (see MERGE_MAX_COLUMNS).
 */
export function backupToSqlStatements(backup: Backup, maxStatementBytes = 90_000): string[] {
  if (backup.version !== BACKUP_VERSION) throw new Error(`unsupported backup version ${backup.version}`)
  for (const [name, table] of Object.entries(backup.tables)) {
    if (!IDENT.test(name) || !table.columns.every(c => IDENT.test(c))) throw new Error(`unsafe identifier in ${name}`)
  }

  const names = orderForRestore(Object.keys(backup.tables))
  const out: string[] = [
    `-- Restore of ${backup.database}, backed up ${backup.created_at}.`,
    `-- Schema at backup time: ${backup.migrations.join(', ') || 'unknown'}.`
  ]

  // Phase 1: deletes, children first. `invites` keeps its live rows for the merge below.
  for (const name of [...names].reverse()) {
    if (name in MERGE_MAX_COLUMNS && backup.tables[name]!.columns.includes('id')) continue
    out.push(`DELETE FROM ${name};`)
  }

  // Phase 2: inserts, parents first, batched by byte size.
  for (const name of names) {
    const table = backup.tables[name]!
    const merge = name in MERGE_MAX_COLUMNS && table.columns.includes('id')
    const suffix = merge
      ? `\nON CONFLICT (id) DO UPDATE SET ${table.columns.filter(c => c !== 'id').map(c =>
        MERGE_MAX_COLUMNS[name]!.includes(c) ? `${c} = max(${c}, excluded.${c})` : `${c} = excluded.${c}`).join(', ')};`
      : ';'
    const prefix = `INSERT INTO ${name} (${table.columns.join(', ')}) VALUES\n`
    const budget = maxStatementBytes - encoder.encode(prefix + suffix).length

    let batch: string[] = []
    let bytes = 0
    const flush = () => {
      if (batch.length) out.push(prefix + batch.join(',\n') + suffix)
      batch = []
      bytes = 0
    }
    for (const row of table.rows) {
      const tuple = `(${row.map(sqlLiteral).join(', ')})`
      const tupleBytes = encoder.encode(tuple).length + 2 // its ',\n' separator
      if (tupleBytes > budget) throw new Error(`a ${name} row alone exceeds ${maxStatementBytes} bytes of SQL`)
      if (bytes + tupleBytes > budget) flush()
      batch.push(tuple)
      bytes += tupleBytes
    }
    flush()
  }
  return out
}

export function backupToSql(backup: Backup, maxStatementBytes = 90_000): string {
  return backupToSqlStatements(backup, maxStatementBytes).join('\n') + '\n'
}
