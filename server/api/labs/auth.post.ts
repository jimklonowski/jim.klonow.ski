export default defineEventHandler(async (event) => {
  const { password } = await readBody<{ password: string }>(event)

  const correctPassword = process.env.LABS_PASSWORD
  if (!correctPassword || password !== correctPassword) {
    throw createError({ statusCode: 401, message: 'Invalid password' })
  }

  setAuthCookie(event, 'owner')
  return { ok: true }
})
