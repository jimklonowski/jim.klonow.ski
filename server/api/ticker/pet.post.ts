import { localToday } from '#shared/utils/time'
import type { TickerPets } from '#shared/types/ticker'

// One pet. Counted on the server so the total is the same on every device, and so a guest's
// pats land in both the house counter and their own footprint for the day.
export default defineEventHandler(async (event): Promise<TickerPets> => {
  const auth = requireRole(event, 'owner', 'friend', 'doctor')
  const today = localToday()
  const current = (await readTickerState(event)).pets as Partial<TickerPets> | undefined
  const pets: TickerPets = {
    total: (current?.total ?? 0) + 1,
    date: today,
    today: (current?.date === today ? current.today ?? 0 : 0) + 1
  }
  await writeTickerState(event, 'pets', pets)

  if (auth.role !== 'owner' && await touchVisit(event, auth)) {
    await getDb(event).prepare('UPDATE ticker_visits SET pets = pets + 1, updated_at = ?3 WHERE invite_id = ?1 AND date = ?2')
      .bind(auth.inviteId, today, new Date().toISOString()).run()
  }
  return pets
})
