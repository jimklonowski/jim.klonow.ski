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
  if (!token || typeof token !== 'string' || !/^[\w-]{16,64}$/.test(token)) {
    throw createError({ statusCode: 400, message: 'Missing share token' })
  }

  // getRealDb, not getDb: invites live only in the real database, and this must keep working
  // for a visitor who currently holds a demo cookie (getDb would route them to the sandbox).
  //
  // The row is keyed by the token's SHA-256, not the token (see hashInviteToken) — so the lookup
  // hashes first. Still one indexed read on the primary key.
  const db = getRealDb(event)
  const invite = await db
    .prepare('SELECT id, role, expires_at, max_uses, uses, revoked FROM invites WHERE id = ?1')
    .bind(hashInviteToken(token))
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
  // The cookie carries the digest, which is what the middleware's liveness check looks up —
  // so a session cookie never holds the share token either.
  setAuthCookie(event, invite.role as Role, invite.id)
  return { ok: true, role: invite.role }
})
