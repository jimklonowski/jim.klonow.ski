import type { PlannedDraw } from '#shared/utils/plannedDraws'

// Readable by every authenticated role: a booked draw is protocol context, same policy as the
// cycles list. The demo sandbox serves its own seeded plan. An environment that has not had
// migration 0007 yet reads as "nothing planned", not a 500 — every consumer (home strip, labs
// header, calendar, dossier) degrades to its no-plan state.
export default defineEventHandler(async (event): Promise<PlannedDraw[]> => {
  requireLabsAuth(event)
  return withEtag(event, await listRows(
    event,
    'SELECT * FROM planned_draws ORDER BY date ASC, id ASC',
    parsePlannedDrawRow,
    { missingTableOk: true }
  ))
})
