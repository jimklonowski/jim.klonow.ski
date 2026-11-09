import type { MarkerGoal } from '#shared/utils/markerGoals'

// Every authenticated role: a goal is protocol context, the same policy as the cycles list. The
// demo sandbox has the table (migration 0020), empty unless a demo session adds one.
export default defineEventHandler(async (event): Promise<MarkerGoal[]> => {
  requireLabsAuth(event)
  return withEtag(event, await listRows(event, 'SELECT * FROM marker_goals ORDER BY stated ASC, id ASC', row => row as unknown as MarkerGoal, { missingTableOk: true }))
})
