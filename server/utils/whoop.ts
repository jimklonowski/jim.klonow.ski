const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer'
const REFRESH_BUFFER_MS = 5 * 60 * 1000

export interface WhoopTokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

export async function getWhoopTokens(db: D1Database): Promise<WhoopTokens | null> {
  const row = await db.prepare('SELECT access_token, refresh_token, expires_at FROM whoop_tokens WHERE id = 1').first<WhoopTokens>()
  return row ?? null
}

export async function saveWhoopTokens(db: D1Database, tokens: WhoopTokens) {
  await db.prepare(`
    INSERT INTO whoop_tokens (id, access_token, refresh_token, expires_at)
    VALUES (1, ?1, ?2, ?3)
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at
  `).bind(tokens.access_token, tokens.refresh_token, tokens.expires_at).run()
}

// sync.ts fires several whoopFetch() calls concurrently (Promise.all), and each independently
// checks token expiry - without this guard, every one of them would see the same near-expiry
// token and race to refresh it in parallel. Whoop invalidates a refresh_token as soon as the
// first request consumes it, so the other concurrent calls would reuse an already-dead token and
// fail (and, worse, permanently kill the connection until a manual reconnect). Sharing a single
// in-flight refresh across concurrent callers on this isolate avoids that entirely.
let refreshInFlight: Promise<WhoopTokens> | null = null

function refreshWhoopTokenOnce(db: D1Database, refreshToken: string): Promise<WhoopTokens> {
  if (!refreshInFlight) {
    refreshInFlight = refreshWhoopToken(db, refreshToken).finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

async function refreshWhoopToken(db: D1Database, refreshToken: string): Promise<WhoopTokens> {
  const clientId = process.env.WHOOP_CLIENT_ID
  const clientSecret = process.env.WHOOP_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw createError({ statusCode: 500, message: 'Whoop client credentials not configured' })
  }

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'offline'
    })
  })

  if (!res.ok) {
    throw createError({ statusCode: 502, message: `Whoop token refresh failed: ${res.status} ${await res.text()}` })
  }

  const data = await res.json<{ access_token: string, refresh_token: string, expires_in: number }>()
  const tokens: WhoopTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000
  }
  await saveWhoopTokens(db, tokens)
  return tokens
}

export async function whoopFetch<T>(db: D1Database, path: string): Promise<T> {
  let tokens = await getWhoopTokens(db)
  if (!tokens) {
    throw createError({ statusCode: 401, message: 'Whoop is not connected' })
  }

  if (tokens.expires_at - Date.now() < REFRESH_BUFFER_MS) {
    tokens = await refreshWhoopTokenOnce(db, tokens.refresh_token)
  }

  const res = await fetch(`${WHOOP_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  })

  if (!res.ok) {
    throw createError({ statusCode: 502, message: `Whoop API request failed: ${res.status} ${await res.text()}` })
  }

  return res.json<T>()
}
