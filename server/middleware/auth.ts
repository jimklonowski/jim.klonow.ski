import { canAccessPage, isProtectedPage, LOGIN_PATH, normalizePath } from '#shared/utils/access'

// Single auth middleware (replaces labs-protect + journal-protect): verifies the signed cookie
// once per request, exposes the result as event.context.auth (requireLabsAuth/requireOwner read
// it), and gates page navigation by role. Runs only for API and protected page paths, so public
// pages and assets pay nothing. The protected-path list is shared with the client's global route
// middleware (app/middleware/auth.global.ts) so the two can't drift.
export default defineEventHandler(async (event) => {
  const path = normalizePath(getRequestURL(event).pathname)
  const isApi = path.startsWith('/api')
  if (!isApi && !isProtectedPage(path)) return

  let auth = readAuthCookie(event)
  // Guest sessions die with their invite: revoking (or deleting) the invite invalidates every
  // cookie minted from it on the next request. Owner sessions never touch the DB here, and demo
  // tokens never carry an invite id. getRealDb explicitly: invites only exist in the real DB.
  if (auth?.inviteId) {
    const row = await getRealDb(event)
      .prepare('SELECT revoked FROM invites WHERE id = ?1')
      .bind(auth.inviteId)
      .first<{ revoked: number }>()
    if (!row || row.revoked) auth = null
  }
  event.context.auth = auth

  if (isApi) return // endpoints enforce their own requirements
  if (path === LOGIN_PATH) return
  if (!auth) return sendRedirect(event, LOGIN_PATH, 302)
  if (!canAccessPage(auth.role, path)) return sendRedirect(event, '/labs', 302)
})
