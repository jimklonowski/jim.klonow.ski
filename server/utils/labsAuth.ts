import type { H3Event } from 'h3'

export function requireLabsAuth(event: H3Event) {
  const cookie = getCookie(event, 'labs-auth')
  const secret = process.env.LABS_SECRET
  if (!secret || !cookie || cookie !== secret) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
}

export function requireUploadPin(event: H3Event) {
  const pin = getCookie(event, 'labs-upload-auth')
  const correctPin = process.env.LABS_UPLOAD_PIN
  if (!correctPin || !pin || pin !== correctPin) {
    throw createError({ statusCode: 403, message: 'Upload PIN required' })
  }
}
