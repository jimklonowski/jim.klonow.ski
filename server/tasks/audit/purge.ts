// Weekly audit-log housekeeping (main DB only; the demo sandbox is never audited):
//  - a deleted photo's R2 files, left in place so the delete could be restored, are removed once
//    it has been gone PHOTO_GRACE_DAYS and nobody restored it (the entry is marked purged_at,
//    after which /tools/data no longer offers the restore);
//  - entries older than RETENTION_DAYS are dropped.

const PHOTO_GRACE_DAYS = 30
const RETENTION_DAYS = 365
const DAY_MS = 86_400_000

async function purge(env: Env) {
  const db = env.DB
  const now = Date.now()
  const graceCutoff = new Date(now - PHOTO_GRACE_DAYS * DAY_MS).toISOString()

  const { results } = await db.prepare(`
    SELECT id, row_key, before FROM audit_log
    WHERE table_name = 'progress_photos' AND action = 'delete'
      AND restored_at IS NULL AND purged_at IS NULL AND at < ?1
  `).bind(graceCutoff).all<{ id: number, row_key: string, before: string | null }>()

  let photos = 0
  let files = 0
  for (const entry of results ?? []) {
    const row = entry.before ? JSON.parse(entry.before) as { r2_key?: string, thumb_r2_key?: string | null } : {}
    // A row back under the same id (restored some other way) still needs its files.
    const live = await db.prepare('SELECT 1 FROM progress_photos WHERE id = ?1').bind(entry.row_key).first()
    if (!live) {
      const keys = [row.r2_key, row.thumb_r2_key].filter((k): k is string => !!k)
      if (keys.length) await env.PHOTOS_BUCKET.delete(keys)
      files += keys.length
      photos++
    }
    await db.prepare('UPDATE audit_log SET purged_at = ?2 WHERE id = ?1').bind(entry.id, new Date(now).toISOString()).run()
  }

  // Photo deletes are always purged well inside a year, so nothing here drops a pending one.
  const pruned = await db.prepare('DELETE FROM audit_log WHERE at < ?1')
    .bind(new Date(now - RETENTION_DAYS * DAY_MS).toISOString()).run()

  return { photos, files, pruned: pruned.meta.changes ?? 0 }
}

export default defineTask({
  meta: {
    name: 'audit:purge',
    description: 'Remove R2 files of photos deleted 30+ days ago and drop audit entries older than a year'
  },
  run: event => runLoggedTask(event, 'audit:purge', purge)
})
