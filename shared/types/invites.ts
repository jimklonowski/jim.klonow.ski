// A share link as GET /api/auth/invites lists it (the sharing page's table). The token itself is
// never here: the row stores only its sha256, and the token is shown once, when it's created.

/** The roles a share link can grant. Owner and demo sessions are never minted from a link. */
export type InviteRole = 'friend' | 'doctor'

export interface Invite {
  /** sha256 of the token, hex. */
  id: string
  role: InviteRole
  label: string | null
  created_at: string
  /** When the link stops redeeming; null means never. */
  expires_at: string | null
  /** Redemption cap; null means unlimited. */
  max_uses: number | null
  uses: number
  /** Revoked links also sign out every session minted from them (server/middleware/auth.ts). */
  revoked: boolean
}
