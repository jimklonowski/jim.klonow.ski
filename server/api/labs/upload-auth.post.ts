export default defineEventHandler(async (event) => {
  const authCookie = getCookie(event, 'labs-auth')
  const secret = process.env.LABS_SECRET
  if (!secret || !authCookie || authCookie !== secret) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { pin } = await readBody<{ pin: string }>(event)
  const correctPin = process.env.LABS_UPLOAD_PIN

  if (!correctPin || !pin || pin !== correctPin) {
    throw createError({ statusCode: 401, message: 'Incorrect PIN' })
  }

  setCookie(event, 'labs-upload-auth', correctPin, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax'
  })

  return { ok: true }
})
