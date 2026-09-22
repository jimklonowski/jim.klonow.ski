interface CreateInviteBody {
  role?: string
  label?: string
  expiresDays?: number | null
  maxUses?: number | null
}

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readBody<CreateInviteBody>(event)
  const role = body?.role
  if (role !== 'friend' && role !== 'doctor') {
    throw createError({ statusCode: 400, message: 'role must be "friend" or "doctor"' })
  }
  // Bounded because it's shown on the sharing page and stored forever.
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 80) || null : null
  // Capped at ten years: an unbounded value overflowed Date and `toISOString()` threw a
  // RangeError, which surfaced as a 500. The UI only offers 7/30/90 days or none anyway.
  const expiresDays = body?.expiresDays != null && Number.isFinite(body.expiresDays) && body.expiresDays > 0
    ? Math.min(Math.floor(body.expiresDays), 3650)
    : null
  const maxUses = body?.maxUses != null && Number.isFinite(body.maxUses) && body.maxUses > 0
    ? Math.min(Math.floor(body.maxUses), 10000)
    : null

  // The row stores only the digest; the token itself is returned once, here, and never again —
  // there is nothing left server-side to rebuild the URL from.
  const token = newInviteToken()
  const now = new Date().toISOString()
  const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 86400000).toISOString() : null

  await getDb(event)
    .prepare('INSERT INTO invites (id, role, label, created_at, expires_at, max_uses) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(hashInviteToken(token), role, label, now, expiresAt, maxUses)
    .run()

  return { ok: true, token, path: `/share/${token}` }
})
