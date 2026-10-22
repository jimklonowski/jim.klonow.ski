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
  // Every table's shape and contents in ONE round trip: a PRAGMA (column order from the schema, so
  // an empty table still records its shape) and a SELECT per table, batched — this used to await
  // two statements per table in turn, ~30 round trips a snapshot (audit #42 item 35).
  const statements = names.flatMap(name => [
    db.prepare(`PRAGMA table_info(${name})`),
    db.prepare(`SELECT * FROM ${name}`)
  ])
  const results = statements.length ? await db.batch<Record<string, unknown>>(statements) : []
  let rows = 0
  names.forEach((name, i) => {
    const info = (results[i * 2]?.results ?? []) as Array<{ name: string }>
    const data = results[i * 2 + 1]?.results ?? []
    backup.tables[name] = toBackupTable(data, info.map(c => c.name))
    rows += data.length
  })
  return { backup, rows }
}
