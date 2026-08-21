import { canAccessPage } from '#shared/utils/access'

// Single auth middleware (replaces labs-protect + journal-protect): verifies the signed cookie
// once per request, exposes the result as event.context.auth (requireLabsAuth/requireOwner read
// it), and gates page navigation by role. Runs only for API and protected page paths, so public
// pages and assets pay nothing.
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  const isApi = path.startsWith('/api')
  const isProtectedPage = path === '/labs' || path.startsWith('/labs/')
    || path === '/journal' || path.startsWith('/journal/')
  if (!isApi && !isProtectedPage) return

  let auth = readAuthCookie(event)
  // Guest sessions die with their invite: revoking (or deleting) the invite invalidates every
  // cookie minted from it on the next request. Owner sessions never touch the DB here.
  if (auth?.inviteId) {
    const row = await getDb(event)
      .prepare('SELECT revoked FROM invites WHERE id = ?1')
      .bind(auth.inviteId)
      .first<{ revoked: number }>()
    if (!row || row.revoked) auth = null
  }
  event.context.auth = auth

  if (isApi) return // endpoints enforce their own requirements
  if (path === '/labs/login') return
  if (!auth) return sendRedirect(event, '/labs/login', 302)
  if (!canAccessPage(auth.role, path)) return sendRedirect(event, '/labs', 302)
})
