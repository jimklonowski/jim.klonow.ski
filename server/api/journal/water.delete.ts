import { zWaterRemove } from '#shared/utils/schemas'
import { removeAtSql } from '#shared/utils/journalRemove'
import type { WaterEntry } from '#shared/types/journal'

// Removes one tap (by index) from a day's `water` array — the widget's undo. Query params, not a
// body, and json_remove in one UPDATE, for the reasons soda.delete.ts records: a DELETE with a
// body hung in production, and a read-splice-write raced under quick successive taps. The UPDATE
// matches only when the index exists (shared/utils/journalRemove.ts), so a stale index is a
// no-op that is NOT audited — it used to log an "update" whose before image equalled the row.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const { date, index } = validatedQuery(event, zWaterRemove)

  const db = getDb(event)
  const before = await auditBefore(event, 'journal_entries', date)
  const res = await db.prepare(removeAtSql('water')).bind(date, index).run()
  const removed = (res.meta.changes ?? 0) > 0
  if (before && removed) await recordAudit(event, { table: 'journal_entries', key: date, before, summary: `− water on ${date}` })

  const row = await db.prepare('SELECT water FROM journal_entries WHERE date = ?1').bind(date).first<{ water: string }>()
  const water = JSON.parse(row?.water ?? '[]') as WaterEntry[]
  return { ok: true, date, water, removed }
})
