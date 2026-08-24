// Role-based page access, shared between the server middleware (SSR / hard navigation) and the
// client route middleware (SPA navigation) so the two can never drift.
//
// owner  — Jim: everything, including writes.
// friend — read-only mirror of the whole site.
// doctor — curated clinical view: labs, body comp, vitals/protocol trends. No daily entries,
//          notes, photos, or soda tracking.
export type Role = 'owner' | 'friend' | 'doctor'

// Pages only the owner can open: write surfaces and access management.
const OWNER_PAGES = [
  /^\/labs\/upload$/,
  /^\/labs\/sharing$/,
  /^\/journal\/import$/,
  /^\/journal\/inventory$/
]

// The doctor allowlist. Everything not listed here is off-limits for that role —
// notably /journal/<date> daily entries, /journal/entries (the day-log ledger),
// /journal/photos, and the write surfaces.
//
// trends/compounds/workouts are listed because they were sections of /journal before the
// hub-and-spoke split; leaving them off would have quietly revoked access the doctor already
// had. /journal/entries is deliberately absent — the daily log was never in this view.
const DOCTOR_PAGES = [
  /^\/labs$/,
  /^\/labs\/dexa$/,
  /^\/journal$/,
  /^\/journal\/trends$/,
  /^\/journal\/compounds$/,
  /^\/journal\/workouts$/,
  /^\/journal\/calendar$/,
  /^\/journal\/calculator$/,
  /^\/journal\/compound\//,
  /^\/journal\/supplements$/
]

export function canAccessPage(role: Role, path: string): boolean {
  if (role === 'owner') return true
  if (OWNER_PAGES.some(re => re.test(path))) return false
  if (role === 'doctor') return DOCTOR_PAGES.some(re => re.test(path))
  return true
}
