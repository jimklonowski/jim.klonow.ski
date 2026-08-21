export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { results } = await getDb(event)
    .prepare('SELECT id, role, label, created_at, expires_at, max_uses, uses, revoked FROM invites ORDER BY created_at DESC')
    .all()

  return (results ?? []).map(r => ({
    id: r.id as string,
    role: r.role as string,
    label: (r.label as string | null) ?? null,
    created_at: r.created_at as string,
    expires_at: (r.expires_at as string | null) ?? null,
    max_uses: (r.max_uses as number | null) ?? null,
    uses: r.uses as number,
    revoked: !!r.revoked
  }))
})
