export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: unknown }>(event)

  // safeEqual is constant-time and false for an unset LABS_PASSWORD (server/utils/auth.ts).
  if (!safeEqual(body?.password, process.env.LABS_PASSWORD)) {
    throw createError({ statusCode: 401, message: 'Invalid password' })
  }

  setAuthCookie(event, 'owner')
  return { ok: true }
})
