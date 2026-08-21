export default defineEventHandler((event) => {
  clearAuthCookies(event)
  return { ok: true }
})
