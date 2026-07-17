import type { DigestKind } from '../../../utils/digest'

// On-demand digest generation, used by the "Generate" action in the digest panel and for testing.
// The scheduled tasks (digest:daily, digest:weekly) call generateDigest directly on their crons.
export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'ANTHROPIC_API_KEY is not configured' })
  }

  const body = await readBody<{ kind?: string, endDate?: string }>(event)
  const kind = body?.kind
  if (kind !== 'daily' && kind !== 'weekly') {
    throw createError({ statusCode: 400, message: "kind must be 'daily' or 'weekly'" })
  }
  if (body?.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate)) {
    throw createError({ statusCode: 400, message: 'Invalid endDate' })
  }

  const result = await generateDigest(getDb(event), apiKey, kind as DigestKind, body?.endDate)
  return result
})
