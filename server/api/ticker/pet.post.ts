import { localToday } from '#shared/utils/time'
import type { TickerPets } from '#shared/types/ticker'

// One pet. Counted on the server so the total is the same on every device, and so a guest's
// pats land in both the house counter and their own footprint for the day.
//
// The house counter is one statement: SQLite's JSON functions bump the stored object in place,
// so two pats landing together (a double-tap, the owner and a guest at once) both count. The
// read-then-write version had both read N and both write N+1.
export default defineEventHandler(async (event): Promise<TickerPets> => {
  // The roles that may open /ticker (access.ts) minus the demo, whose pet remembers in the browser.
  const auth = requireTickerAccess(event)
  if (auth.role === 'demo') throw createError({ statusCode: 403, message: 'The demo pet remembers in the browser' })
  const today = localToday()
  const db = getDb(event)
  const now = new Date().toISOString()

  const row = await db.prepare(`
    INSERT INTO ticker_state (key, value, updated_at)
    VALUES ('pets', json_object('total', 1, 'date', ?1, 'today', 1), ?2)
    ON CONFLICT(key) DO UPDATE SET
      value = json_object(
        'total', COALESCE(json_extract(value, '$.total'), 0) + 1,
        'date', ?1,
        'today', CASE WHEN json_extract(value, '$.date') = ?1 THEN COALESCE(json_extract(value, '$.today'), 0) + 1 ELSE 1 END
      ),
      updated_at = excluded.updated_at
    RETURNING value
  `).bind(today, now).first<{ value: string }>()
  const pets = JSON.parse(row?.value ?? '{"total":1,"today":1}') as Partial<TickerPets>
  const result: TickerPets = { total: pets.total ?? 1, date: today, today: pets.today ?? 1 }

  if (auth.role !== 'owner' && await touchVisit(event, auth)) {
    await db.prepare('UPDATE ticker_visits SET pets = pets + 1, updated_at = ?3 WHERE invite_id = ?1 AND date = ?2')
      .bind(auth.inviteId, today, now).run()
  }
  return result
})
