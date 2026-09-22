import { isIsoDate } from '#shared/utils/time'
import type { DigestKind } from '../../../utils/digest'

// On-demand digest generation, used by the "Generate" action in the digest panel and for testing.
// The scheduled tasks (digest:daily, digest:weekly) call generateDigest directly on their crons.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readBody<{ kind?: string, endDate?: string }>(event)
  const kind = body?.kind
  if (kind !== 'daily' && kind !== 'weekly') {
    throw createError({ statusCode: 400, message: 'kind must be \'daily\' or \'weekly\'' })
  }
  if (body?.endDate != null && !isIsoDate(body.endDate)) {
    throw createError({ statusCode: 400, message: 'Invalid endDate' })
  }

  return generateDigest(getDb(event), kind as DigestKind, body?.endDate)
})
