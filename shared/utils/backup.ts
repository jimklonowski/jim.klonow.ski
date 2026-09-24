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
 * The backup as SQL that replaces each table's rows: DELETE, then batched INSERTs. Run against a
 * database already at the backup's schema (`pnpm db:migrate` builds one). Explicit ids are kept,
 * so AUTOINCREMENT counters move past them on their own.
 */
export function backupToSql(backup: Backup, rowsPerInsert = 50): string {
  if (backup.version !== BACKUP_VERSION) throw new Error(`unsupported backup version ${backup.version}`)
  const out: string[] = [
    `-- Restore of ${backup.database}, backed up ${backup.created_at}.`,
    `-- Schema at backup time: ${backup.migrations.join(', ') || 'unknown'}.`
  ]
  for (const [name, table] of Object.entries(backup.tables)) {
    if (!IDENT.test(name) || !table.columns.every(c => IDENT.test(c))) throw new Error(`unsafe identifier in ${name}`)
    out.push(`DELETE FROM ${name};`)
    for (let i = 0; i < table.rows.length; i += rowsPerInsert) {
      const values = table.rows.slice(i, i + rowsPerInsert).map(r => `(${r.map(sqlLiteral).join(', ')})`)
      out.push(`INSERT INTO ${name} (${table.columns.join(', ')}) VALUES\n${values.join(',\n')};`)
    }
  }
  return out.join('\n') + '\n'
}
