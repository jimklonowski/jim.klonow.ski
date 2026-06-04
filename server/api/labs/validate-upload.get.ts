export default defineEventHandler((event) => {
  const cookie = getCookie(event, 'labs-upload-auth')
  const pin = process.env.LABS_UPLOAD_PIN
  if (!pin || !cookie || cookie !== pin) {
    throw createError({ statusCode: 401 })
  }
  return { ok: true }
})
