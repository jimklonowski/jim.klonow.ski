import type { Invite, InviteRole } from '#shared/types/invites'

export default defineEventHandler(async (event): Promise<Invite[]> => {
  requireOwner(event)

  // getRealDb: invites are auth infrastructure and only exist in the real database.
  const { results } = await getRealDb(event)
    .prepare('SELECT id, role, label, created_at, expires_at, max_uses, uses, revoked FROM invites ORDER BY created_at DESC')
    .all()

  return (results ?? []).map(r => ({
    id: r.id as string,
    role: r.role as InviteRole,
    label: (r.label as string | null) ?? null,
    created_at: r.created_at as string,
    expires_at: (r.expires_at as string | null) ?? null,
    max_uses: (r.max_uses as number | null) ?? null,
    uses: r.uses as number,
    revoked: !!r.revoked
  }))
})
