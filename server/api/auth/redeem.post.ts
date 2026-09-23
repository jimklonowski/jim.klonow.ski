import { zRedeem } from '#shared/utils/schemas'
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
  const { token } = await readValidatedJson(event, zRedeem)

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

  // The checks above give the right error message; this conditional UPDATE is what actually
  // enforces the limit. Checking and then incrementing as two statements let two simultaneous
  // redemptions of a one-use link both read uses = 0 and both succeed. Folding the limit into
  // the UPDATE makes the claim atomic: exactly one of them changes a row.
  const claim = await db.prepare(`
    UPDATE invites SET uses = uses + 1
    WHERE id = ?1 AND revoked = 0 AND (max_uses IS NULL OR uses < max_uses)
  `).bind(invite.id).run()
  if (!claim.meta.changes) {
    throw createError({ statusCode: 410, message: 'This share link has reached its use limit' })
  }
  // The cookie carries the digest, which is what the middleware's liveness check looks up —
  // so a session cookie never holds the share token either.
  setAuthCookie(event, invite.role as Role, invite.id)
  return { ok: true, role: invite.role }
})
