export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/labs')) return
  if (to.path === '/labs/login') return

  // On SSR, the server middleware (labs-protect.ts) already validates the
  // httpOnly cookie and redirects unauthenticated requests before this runs.
  // Skip the validate fetch here to avoid it running without cookie context.
  if (import.meta.server) return

  try {
    await $fetch('/api/labs/validate')
  }
  catch {
    return navigateTo('/labs/login')
  }
})
