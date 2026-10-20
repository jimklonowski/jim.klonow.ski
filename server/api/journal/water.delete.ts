import { zWaterRemove } from '#shared/utils/schemas'
import type { WaterEntry } from '#shared/types/journal'

// Removes one tap (by index) from a day's `water` array — the widget's undo. Query params, not a
// body, and json_remove in one UPDATE, for the reasons soda.delete.ts records: a DELETE with a
// body hung in production, and a read-splice-write raced under quick successive taps.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const { date, index } = validatedQuery(event, zWaterRemove)

  const db = getDb(event)
  const before = await auditBefore(event, 'journal_entries', date)
  await db.prepare(`
    UPDATE journal_entries SET water = json_remove(water, '$[' || CAST(?2 AS INTEGER) || ']') WHERE date = ?1
  `).bind(date, index).run()
  if (before) await recordAudit(event, { table: 'journal_entries', key: date, before, summary: `− water on ${date}` })

  const row = await db.prepare('SELECT water FROM journal_entries WHERE date = ?1').bind(date).first<{ water: string }>()
  const water = JSON.parse(row?.water ?? '[]') as WaterEntry[]
  return { ok: true, date, water }
})
