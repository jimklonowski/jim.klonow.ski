import { zMealEstimateRequest } from '#shared/utils/schemas'

// Estimate up to 50 meal texts: cached rows come back as they are, the rest cost one model call
// and are cached. Owner-only like every Claude-spending endpoint — the demo sandbox shows the
// estimates its seed carries and never calls the model.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  const { texts } = await readValidatedJson(event, zMealEstimateRequest)
  const estimates = await estimateMeals(getDb(event), texts)
  return { estimates }
})
