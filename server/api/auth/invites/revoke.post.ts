import { zInviteRevoke } from '#shared/utils/schemas'

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { id } = await readValidatedJson(event, zInviteRevoke)

  // Revoking (not deleting) keeps the row so the auth middleware's liveness check can reject
  // session cookies already minted from this invite.
  await getRealDb(event).prepare('UPDATE invites SET revoked = 1 WHERE id = ?1').bind(id).run()
  return { ok: true }
})
