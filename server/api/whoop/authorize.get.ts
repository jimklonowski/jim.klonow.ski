const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const SCOPES = 'offline read:recovery read:sleep read:cycles read:profile read:workout'

export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  // /journal is single-password-gated, not single-user - anyone with that password could hit this
  // URL directly and silently swap whose Whoop account feeds the dashboard. Once connected, require
  // an explicit ?reconnect=true to replace it, rather than allowing a second OAuth grant to overwrite silently.
  const alreadyConnected = await getWhoopTokens(getDb(event))
  if (alreadyConnected && getQuery(event).reconnect !== 'true') {
    throw createError({ statusCode: 409, message: 'Whoop is already connected. Pass ?reconnect=true to replace the connection.' })
  }

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
