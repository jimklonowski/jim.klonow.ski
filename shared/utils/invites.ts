// What a share link can still do, as the sharing page reads it (audit #43 item 33). The list
// used to go by `revoked` alone, so a link past its expiry or at its use limit stayed "active"
// with the accent chip and "expires <a date already gone>" under it. The same rules the redeem
// endpoint enforces (server/api/auth/redeem.post.ts), read ahead of time.
import type { Invite } from '../types/invites.ts'

/**
 * - `active`: still redeemable.
 * - `expired` / `exhausted`: no longer redeemable — but a session already minted from the link
 *   stays signed in until it is REVOKED (the middleware checks `revoked`, not these), so the
 *   revoke control stays on such rows.
 * - `revoked`: closed, and every session from it signed out.
 */
export type InviteState = 'active' | 'expired' | 'exhausted' | 'revoked'

export function inviteState(invite: Pick<Invite, 'revoked' | 'expires_at' | 'max_uses' | 'uses'>, now: string = new Date().toISOString()): InviteState {
  if (invite.revoked) return 'revoked'
  if (invite.expires_at && invite.expires_at < now) return 'expired'
  if (invite.max_uses != null && invite.uses >= invite.max_uses) return 'exhausted'
  return 'active'
}
