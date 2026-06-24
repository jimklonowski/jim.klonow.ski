export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/journal')) return
  if (import.meta.server) return

  try {
    await $fetch('/api/labs/validate')
  }
  catch {
    return navigateTo('/labs/login')
  }
})
