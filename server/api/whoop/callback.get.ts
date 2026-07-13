const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : null
  const state = typeof query.state === 'string' ? query.state : null

  const expectedState = getCookie(event, 'whoop-oauth-state')
  deleteCookie(event, 'whoop-oauth-state', { path: '/' })

  if (!code || !state || !expectedState || state !== expectedState) {
    throw createError({ statusCode: 400, message: 'Invalid Whoop OAuth callback' })
  }

  const clientId = process.env.WHOOP_CLIENT_ID
  const clientSecret = process.env.WHOOP_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw createError({ statusCode: 500, message: 'Whoop client credentials not configured' })
  }

  const redirectUri = `${getRequestURL(event).origin}/api/whoop/callback`
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    })
  })

  if (!res.ok) {
    throw createError({ statusCode: 502, message: `Whoop token exchange failed: ${res.status} ${await res.text()}` })
  }

  const data = await res.json<{ access_token: string, refresh_token: string, expires_in: number }>()

  const db = getDb(event)
  await saveWhoopTokens(db, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000
  })

  return sendRedirect(event, '/journal')
})
