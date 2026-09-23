import { zInviteCreate } from '#shared/utils/schemas'

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { role, label, expiresDays, maxUses } = await readValidatedJson(event, zInviteCreate)

  // The row stores only the digest; the token itself is returned once, here, and never again —
  // there is nothing left server-side to rebuild the URL from.
  const token = newInviteToken()
  const now = new Date().toISOString()
  const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 86400000).toISOString() : null

  await getRealDb(event)
    .prepare('INSERT INTO invites (id, role, label, created_at, expires_at, max_uses) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(hashInviteToken(token), role, label, now, expiresAt, maxUses)
    .run()

  return { ok: true, token, path: `/share/${token}` }
})
