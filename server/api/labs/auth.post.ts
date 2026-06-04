export default defineEventHandler(async (event) => {
  const { password } = await readBody<{ password: string }>(event)

  const correctPassword = process.env.LABS_PASSWORD
  const secret = process.env.LABS_SECRET

  if (!correctPassword || !secret || password !== correctPassword) {
    throw createError({ statusCode: 401, message: 'Invalid password' })
  }

  setCookie(event, 'labs-auth', secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
    sameSite: 'lax'
  })

  return { ok: true }
})
