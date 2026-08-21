export default defineEventHandler((event) => {
  requireLabsAuth(event)
  return { ok: true }
})
