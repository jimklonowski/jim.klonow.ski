export default defineEventHandler((event) => {
  const cookie = getCookie(event, 'labs-auth')
  const secret = process.env.LABS_SECRET
  if (!secret || !cookie || cookie !== secret) {
    throw createError({ statusCode: 401 })
  }
  return { ok: true }
})
