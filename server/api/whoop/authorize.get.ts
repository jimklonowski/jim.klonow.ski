const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const SCOPES = 'offline read:recovery read:sleep read:cycles read:profile'

export default defineEventHandler((event) => {
  requireLabsAuth(event)

  const clientId = process.env.WHOOP_CLIENT_ID
  if (!clientId) {
    throw createError({ statusCode: 500, message: 'Whoop client credentials not configured' })
  }

  const state = crypto.randomUUID()
  setCookie(event, 'whoop-oauth-state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
    sameSite: 'lax'
  })

  const redirectUri = `${getRequestURL(event).origin}/api/whoop/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state
  })

  return sendRedirect(event, `${WHOOP_AUTH_URL}?${params.toString()}`)
})
