import { canAccessPage, isProtectedPage, LOGIN_PATH, normalizePath } from '#shared/utils/access'
import type { Role } from '#shared/utils/access'

// Client-side counterpart of server/middleware/auth.ts. The server middleware only sees hard
// navigations, so SPA route changes re-check role access here.
//
// Global (not opt-in per page) on purpose: this replaced two near-identical middlewares that 22
// pages had to remember to name in definePageMeta. A page that forgot was gated on a hard load
// and wide open on an in-app link. The path list now lives in shared/utils/access.ts, which the
// server middleware reads too.
//
// This is UI routing, not enforcement — every API handler asserts its own requirement, so the
// worst case here is a page that renders and then fails its own data fetches.
export default defineNuxtRouteMiddleware(async (to) => {
  // On SSR, server/middleware/auth.ts already validated the httpOnly cookie and role access,
  // redirecting before this runs.
  if (import.meta.server) return

  const path = normalizePath(to.path)
  if (path === LOGIN_PATH || !isProtectedPage(path)) return

  // The shell (status line, footer, ⌘K palette) calls useAuth() on every page, so the role is
  // already in the payload cache — this used to refetch /api/auth/me on every single navigation.
  const cached = useNuxtData<{ role: Role | null }>('auth-me').data.value
  let role: Role | null
  if (cached) {
    role = cached.role
  }
  else {
    try {
      role = (await $fetch<{ role: Role | null }>('/api/auth/me')).role
    }
    catch {
      // Couldn't reach the server. Previously this bounced to the login page, which meant an
      // offline PWA or one dropped request looked exactly like being signed out. Let the
      // navigation stand: the page's own fetches will surface the failure, and the server is
      // the actual boundary.
      return
    }
  }

  if (!role) return navigateTo(LOGIN_PATH)
  if (!canAccessPage(role, path)) return navigateTo('/labs')
})
