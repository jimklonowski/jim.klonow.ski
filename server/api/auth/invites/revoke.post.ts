export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { id } = await readBody<{ id?: string }>(event)
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, message: 'Missing invite id' })
  }

  // Revoking (not deleting) keeps the row so the auth middleware's liveness check can reject
  // session cookies already minted from this invite.
  await getDb(event).prepare('UPDATE invites SET revoked = 1 WHERE id = ?1').bind(id).run()
  return { ok: true }
})
