export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/labs/login') return

  // On SSR, server/middleware/auth.ts already validated the httpOnly cookie and role access,
  // redirecting before this runs. Only SPA navigation needs the client-side check.
  if (import.meta.server) return

  return await checkClientAccess(to.path)
})
