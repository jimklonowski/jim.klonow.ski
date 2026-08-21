import { canAccessPage } from '#shared/utils/access'
import type { Role } from '#shared/utils/access'

// Client-side counterpart of server/middleware/auth.ts: the server middleware only sees hard
// navigations, so SPA route changes re-check role access here. Returns the redirect (if any)
// for the route middleware to return.
export async function checkClientAccess(path: string) {
  try {
    const { role } = await $fetch<{ role: Role | null }>('/api/auth/me')
    if (!role) return navigateTo('/labs/login')
    if (!canAccessPage(role, path)) return navigateTo('/labs')
  }
  catch {
    return navigateTo('/labs/login')
  }
}
