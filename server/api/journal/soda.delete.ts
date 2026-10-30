import { zSodaRemove } from '#shared/utils/schemas'
import { expectedBindings, removeAtSql, removeExpectedSql } from '#shared/utils/journalRemove'

// Removes one entry (by index) from a day's `sodas` array - lets the dashboard widget undo a mis-tap.
//
// Takes `date`/`index` as query params rather than a JSON body - a DELETE with a body reliably
// hung forever in production (confirmed via console.log tracing under `wrangler tail`: execution
// stalled inside `readBody`, never even reaching the DB call). DELETE-with-body is non-standard
// enough that something in Cloudflare's edge path doesn't forward it faithfully to the Worker.
//
// The removal itself is a single atomic UPDATE via SQLite's json_remove rather than SELECT-then-
// JS-splice-then-UPDATE, for the same lost-update-under-concurrency reason as soda.post.ts. The
// updated array is fetched with a follow-up SELECT rather than an `UPDATE ... RETURNING`, which
// separately also hung when it landed within ~1s of another write to the same row.
//
// The UPDATE matches only when the index exists (shared/utils/journalRemove.ts), so a stale
// index is a no-op that is NOT audited — it used to log an "update" whose before image equalled
// the row (audit #42 item 24).
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  // A negative index would build the JSON path '$[-1]', which SQLite rejects outright — the
  // whole statement then failed as an unhandled 500. The schema requires a non-negative integer.
  const { date, index, time, drink, size } = validatedQuery(event, zSodaRemove)

  const db = getDb(event)
  const before = await auditBefore(event, 'journal_entries', date)
  // With the entry the widget saw, only that entry goes — a stale list's index is a no-op.
  const res = await (time != null
    ? db.prepare(removeExpectedSql('sodas')).bind(date, index, ...expectedBindings({ time, drink, size }))
    : db.prepare(removeAtSql('sodas')).bind(date, index)
  ).run()
  const removed = (res.meta.changes ?? 0) > 0
  if (before && removed) await recordAudit(event, { table: 'journal_entries', key: date, before, summary: `− soda on ${date}` })

  const row = await db.prepare('SELECT sodas FROM journal_entries WHERE date = ?1').bind(date).first<{ sodas: string }>()
  const sodas = JSON.parse(row?.sodas ?? '[]') as Array<{ time: string, drink?: string, size?: string }>
  return { ok: true, date, sodas, removed }
})
