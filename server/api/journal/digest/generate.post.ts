import { zDigestGenerate } from '#shared/utils/schemas'

// On-demand digest generation, used by the "Generate" action in the digest panel and for testing.
// The scheduled tasks (digest:daily, digest:weekly) call generateDigest directly on their crons.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { kind, endDate } = await readValidatedJson(event, zDigestGenerate)

  return generateDigest(getDb(event), kind, endDate)
})
