import { zWaterAdd } from '#shared/utils/schemas'
import { localTimeNow, localToday } from '#shared/utils/time'
import type { WaterEntry } from '#shared/types/journal'

// One tap on the water tracker: appends {time, oz} to the day's `water` array without touching
// the rest of the journal_entries row, exactly as soda.post.ts does for sodas — the same single
// INSERT ... ON CONFLICT with json_insert('$[#]'), so two quick taps can't lose each other, and
// the same follow-up SELECT instead of RETURNING (see soda.delete.ts for the production hang).
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const body = await readValidatedJson(event, zWaterAdd)
  // Home-timezone fallbacks for non-JS callers; the widget sends both (a Worker's clock is UTC).
  const date = body.date ?? localToday()
  const time = body.time ?? localTimeNow()
  const entry = JSON.stringify({ time, oz: body.oz })

  const db = getDb(event)
  const before = await auditBefore(event, 'journal_entries', date)
  await db.prepare(`
    INSERT INTO journal_entries (date, water) VALUES (?1, json_array(json(?2)))
    ON CONFLICT(date) DO UPDATE SET water = json_insert(water, '$[#]', json(?2))
  `).bind(date, entry).run()
  await recordAudit(event, { table: 'journal_entries', key: date, before, summary: `+ ${body.oz} oz water on ${date}` })

  const row = await db.prepare('SELECT water FROM journal_entries WHERE date = ?1').bind(date).first<{ water: string }>()
  const water = JSON.parse(row?.water ?? '[]') as WaterEntry[]
  return { ok: true, date, water }
})
