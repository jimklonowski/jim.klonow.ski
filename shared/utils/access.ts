// Role-based page access, shared between the server middleware (SSR / hard navigation) and the
// client route middleware (SPA navigation) so the two can never drift.
//
// owner  — Jim: everything, including writes.
// friend — read-only mirror of the whole site.
// doctor — curated clinical view: labs, body comp, vitals/protocol trends. No daily entries,
//          notes, photos, or soda tracking.
// demo   — self-serve public sandbox: browses (and edits) the synthetic persona in DEMO_DB.
//          Blocked from anything that spends money, uploads binaries, or manages access.
export type Role = 'owner' | 'friend' | 'doctor' | 'demo'

// Pages the demo role may not open: AI spend, uploads, and access management. The vial
// inventory is deliberately NOT here — demo gets it (it edits the sandbox DB, and it's
// one of the showcase features).
const DEMO_BLOCKED_PAGES = [
  /^\/labs\/upload$/,
  /^\/tools\/import$/,
  /^\/tools\/sharing$/,
  /^\/ask$/
]

// Pages only the owner can open: write surfaces, access management, and the AI chat
// (which spends Anthropic tokens — same policy as digest regeneration).
const OWNER_PAGES = [
  ...DEMO_BLOCKED_PAGES,
  /^\/tools\/inventory$/
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
  // The calculator lived at /journal/calculator until the TOOLS section split (Aug 2026);
  // the old path 301s to this one.
  /^\/tools\/calculator$/,
  /^\/journal\/compound\//,
  /^\/journal\/supplements$/,
  // An immunization record is exactly what a clinician asks for.
  /^\/journal\/vaccines$/,
  // Planned cycles are protocol context, same policy as the supplement stack.
  /^\/journal\/cycles$/,
  /^\/journal\/cycle\//
]

/** The sign-in page: inside the gated prefix, but it is the way in, so never gated itself. */
export const LOGIN_PATH = '/labs/login'

/** Trailing slashes off, empty means root — so '/journal/' and '/journal' are one path. */
export function normalizePath(path: string): string {
  return path.replace(/\/+$/, '') || '/'
}

/**
 * Page paths behind the auth gate. Shared so the server middleware (hard navigation) and the
 * global route middleware (SPA navigation) gate exactly the same set — they were two hand-kept
 * lists, and the client's was opt-in per page, so a new page under /journal was protected on a
 * hard load and open on an in-app link until someone remembered the definePageMeta line.
 */
export function isProtectedPage(path: string): boolean {
  const p = normalizePath(path)
  return p === '/labs' || p.startsWith('/labs/')
    || p === '/journal' || p.startsWith('/journal/')
    || p === '/tools' || p.startsWith('/tools/')
    || p === '/ask'
}

export function canAccessPage(role: Role, path: string): boolean {
  if (role === 'owner') return true
  if (role === 'demo') return !DEMO_BLOCKED_PAGES.some(re => re.test(path))
  if (OWNER_PAGES.some(re => re.test(path))) return false
  if (role === 'doctor') return DOCTOR_PAGES.some(re => re.test(path))
  return true
}

// The roles that see the full (non-doctor) experience: digests, photos, daily entries.
// Shared so the hand-rolled isFullAccess computeds in the shell components can't drift.
export function isFullAccessRole(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'friend' || role === 'demo'
}
