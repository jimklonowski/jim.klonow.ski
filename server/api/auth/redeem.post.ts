import type { Role } from '#shared/utils/access'

interface InviteRow {
  id: string
  role: string
  expires_at: string | null
  max_uses: number | null
  uses: number
  revoked: number
}

// Public: exchanges a share-link token for a role session cookie. Rate-limited via routeRules
// in nuxt.config (tokens are 24 random bytes, so brute force is not realistic anyway).
export default defineEventHandler(async (event) => {
  const { token } = await readBody<{ token?: string }>(event)
  if (!token || typeof token !== 'string' || token.length > 64) {
    throw createError({ statusCode: 400, message: 'Missing share token' })
  }

  const db = getDb(event)
  const invite = await db
    .prepare('SELECT id, role, expires_at, max_uses, uses, revoked FROM invites WHERE id = ?1')
    .bind(token)
    .first<InviteRow>()

  if (!invite || invite.revoked || (invite.role !== 'friend' && invite.role !== 'doctor')) {
    throw createError({ statusCode: 404, message: 'This share link is no longer valid' })
  }
  if (invite.expires_at && invite.expires_at < new Date().toISOString()) {
    throw createError({ statusCode: 410, message: 'This share link has expired' })
  }
  if (invite.max_uses != null && invite.uses >= invite.max_uses) {
    throw createError({ statusCode: 410, message: 'This share link has reached its use limit' })
  }

  await db.prepare('UPDATE invites SET uses = uses + 1 WHERE id = ?1').bind(invite.id).run()
  setAuthCookie(event, invite.role as Role, invite.id)
  return { ok: true, role: invite.role }
})
