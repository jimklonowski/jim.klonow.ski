import { BACKUP_VERSION, isBackedUpTable, toBackupTable, type Backup } from '#shared/utils/backup'

// A whole-database snapshot in the backup format (shared/utils/backup.ts). The weekly db:backup
// task gzips one into R2, and the owner's /api/export hands one to the browser, so the file you
// download is the same thing a restore reads.

export async function snapshotDatabase(db: D1Database, database: string): Promise<{ backup: Backup, rows: number }> {
  const { results: tableRows } = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all<{ name: string }>()
  const names = (tableRows ?? []).map(t => t.name).filter(isBackedUpTable)

  const { results: applied } = await db
    .prepare('SELECT name FROM d1_migrations ORDER BY id')
    .all<{ name: string }>()
    .catch(() => ({ results: [] as { name: string }[] }))

  const backup: Backup = {
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    database,
    migrations: (applied ?? []).map(m => m.name),
    tables: {}
  }
  let rows = 0
  for (const name of names) {
    // Column order from the schema, so an empty table still records its shape.
    const { results: info } = await db.prepare(`PRAGMA table_info(${name})`).all<{ name: string }>()
    const { results } = await db.prepare(`SELECT * FROM ${name}`).all<Record<string, unknown>>()
    backup.tables[name] = toBackupTable(results ?? [], (info ?? []).map(c => c.name))
    rows += results?.length ?? 0
  }
  return { backup, rows }
}
