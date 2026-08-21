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
  const label = body?.label?.trim() || null
  const expiresDays = body?.expiresDays != null && Number.isFinite(body.expiresDays) && body.expiresDays > 0
    ? Math.floor(body.expiresDays)
    : null
  const maxUses = body?.maxUses != null && Number.isFinite(body.maxUses) && body.maxUses > 0
    ? Math.floor(body.maxUses)
    : null

  const id = newInviteToken()
  const now = new Date().toISOString()
  const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 86400000).toISOString() : null

  await getDb(event)
    .prepare('INSERT INTO invites (id, role, label, created_at, expires_at, max_uses) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(id, role, label, now, expiresAt, maxUses)
    .run()

  return { ok: true, id, path: `/share/${id}` }
})
