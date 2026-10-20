import { zMealSet } from '#shared/utils/schemas'
import type { MealSlot } from '#shared/utils/nutrition'

// One meal slot of one day, written without the rest of the form — the hub's "+ add lunch". A
// single INSERT ... ON CONFLICT with json_set, like the soda and water appends, so it never
// touches the vitals, doses or notes on the row and can't lose a concurrent quick-add. An empty
// text clears the slot (json_remove). The slot is a validated enum, so building the JSON path
// from it is safe.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)
  const { date, slot, text } = await readValidatedJson(event, zMealSet)

  const db = getDb(event)
  const before = await auditBefore(event, 'journal_entries', date)
  if (text) {
    await db.prepare(`
      INSERT INTO journal_entries (date, food) VALUES (?1, json_object(?2, ?3))
      ON CONFLICT(date) DO UPDATE SET food = json_set(COALESCE(food, '{}'), '$.' || ?2, ?3)
    `).bind(date, slot, text).run()
    await recordAudit(event, { table: 'journal_entries', key: date, before, summary: `${slot} on ${date}: ${text}` })
  }
  else {
    await db.prepare(`
      UPDATE journal_entries SET food = json_remove(COALESCE(food, '{}'), '$.' || ?2) WHERE date = ?1
    `).bind(date, slot).run()
    if (before) await recordAudit(event, { table: 'journal_entries', key: date, before, summary: `− ${slot} on ${date}` })
  }

  const row = await db.prepare('SELECT food FROM journal_entries WHERE date = ?1').bind(date).first<{ food: string }>()
  const food = JSON.parse(row?.food || '{}') as Partial<Record<MealSlot, string>>
  return { ok: true, date, food }
})
