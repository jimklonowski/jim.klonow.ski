import type { MealEstimate } from '#shared/utils/nutrition'

// Every cached meal estimate — a few hundred short rows, read once per visit and indexed by key
// on the client (useMealEstimates). The doctor view has no food, so it gets none of these either.
export default defineEventHandler(async (event): Promise<MealEstimate[]> => {
  const auth = requireLabsAuth(event)
  if (auth.role === 'doctor') return withEtag(event, [])
  // A sandbox that hasn't had migration 0012 yet reads as "nothing estimated", not a 500.
  const rows = await listRows(event, 'SELECT * FROM meal_estimates ORDER BY text ASC', parseEstimateRow, { missingTableOk: true })
  return withEtag(event, rows)
})
