export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { pin } = await readBody<{ pin: string }>(event)
  const correctPin = process.env.LABS_UPLOAD_PIN
  if (!correctPin || !pin || pin !== correctPin) {
    throw createError({ statusCode: 401, message: 'Incorrect PIN' })
  }

  setUploadCookie(event)
  return { ok: true }
})
