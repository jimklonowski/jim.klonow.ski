import { zPinLogin } from '#shared/utils/schemas'

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { pin } = await readValidatedJson(event, zPinLogin)
  // safeEqual is constant-time and false for an unset LABS_UPLOAD_PIN (server/utils/auth.ts).
  if (!safeEqual(pin, process.env.LABS_UPLOAD_PIN)) {
    throw createError({ statusCode: 401, message: 'Incorrect PIN' })
  }

  setUploadCookie(event)
  return { ok: true }
})
