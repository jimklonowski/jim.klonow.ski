import type { DrinkLabel } from '#shared/utils/drinks'

// The owner's label figures for drinks — a handful of rows, indexed on the client beside the
// meal estimates (useMealEstimates). Same audience as those: the doctor view has no food log.
export default defineEventHandler(async (event): Promise<DrinkLabel[]> => {
  const auth = requireLabsAuth(event)
  if (auth.role === 'doctor') return withEtag(event, [])
  return withEtag(event, await listRows(event, 'SELECT * FROM drink_labels ORDER BY name ASC', parseDrinkLabelRow, { missingTableOk: true }))
})
