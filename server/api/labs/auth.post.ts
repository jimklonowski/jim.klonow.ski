import { zPasswordLogin } from '#shared/utils/schemas'

export default defineEventHandler(async (event) => {
  const { password } = await readValidatedJson(event, zPasswordLogin)

  // safeEqual is constant-time and false for an unset LABS_PASSWORD (server/utils/auth.ts).
  if (!safeEqual(password, process.env.LABS_PASSWORD)) {
    throw createError({ statusCode: 401, message: 'Invalid password' })
  }

  setAuthCookie(event, 'owner')
  return { ok: true }
})
