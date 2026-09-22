import type { WhoopStatus } from '#shared/types/whoop'

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer'
const REFRESH_BUFFER_MS = 5 * 60 * 1000

// The collection endpoints cap `limit` at 25 and default to 10, so a sync that reads one default
// page sees only the last ~10 records. Ask for the maximum and follow `next_token` instead.
const PAGE_LIMIT = 25
const MAX_PAGES = 20

export interface WhoopTokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

interface TokenRow extends WhoopTokens {
  revoked: number
  last_synced_at: string | null
  last_error: string | null
  last_error_at: string | null
}

async function tokenRow(db: D1Database): Promise<TokenRow | null> {
  const row = await db
    .prepare('SELECT access_token, refresh_token, expires_at, revoked, last_synced_at, last_error, last_error_at FROM whoop_tokens WHERE id = 1')
    .first<TokenRow>()
  return row ?? null
}

/**
 * The live tokens, or null when Whoop isn't connected — including when the stored refresh token
 * has been rejected. A revoked row is kept rather than deleted so the UI can say *why* the
 * connection stopped working; only a reconnect clears it.
 */
export async function getWhoopTokens(db: D1Database): Promise<WhoopTokens | null> {
  const row = await tokenRow(db)
  if (!row || row.revoked) return null
  return { access_token: row.access_token, refresh_token: row.refresh_token, expires_at: row.expires_at }
}

export async function getWhoopStatus(db: D1Database): Promise<WhoopStatus> {
  const row = await tokenRow(db)
  return {
    connected: !!row && !row.revoked,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastError: row?.last_error ?? null,
    lastErrorAt: row?.last_error_at ?? null,
    needsReconnect: !!row?.revoked
  }
}

/** Stores a fresh token pair. Clears the revoked flag and the last error — this is a reconnect. */
export async function saveWhoopTokens(db: D1Database, tokens: WhoopTokens) {
  await db.prepare(`
    INSERT INTO whoop_tokens (id, access_token, refresh_token, expires_at, revoked, last_error, last_error_at)
    VALUES (1, ?1, ?2, ?3, 0, NULL, NULL)
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      revoked = 0,
      last_error = NULL,
      last_error_at = NULL
  `).bind(tokens.access_token, tokens.refresh_token, tokens.expires_at).run()
}

export async function markWhoopSynced(db: D1Database) {
  await db.prepare('UPDATE whoop_tokens SET last_synced_at = ?1, last_error = NULL, last_error_at = NULL WHERE id = 1')
    .bind(new Date().toISOString()).run()
}

export async function markWhoopError(db: D1Database, message: string) {
  await db.prepare('UPDATE whoop_tokens SET last_error = ?1, last_error_at = ?2 WHERE id = 1')
    .bind(message.slice(0, 500), new Date().toISOString()).run()
}

/**
 * Marks the connection dead. Whoop invalidates a refresh token the moment it's consumed, so a
 * rejected refresh means no future request can succeed — without this the row stayed, `connected`
 * kept reporting true, and the nightly cron failed silently until someone noticed missing data.
 */
async function revokeWhoopTokens(db: D1Database, reason: string) {
  await db.prepare('UPDATE whoop_tokens SET revoked = 1, last_error = ?1, last_error_at = ?2 WHERE id = 1')
    .bind(reason.slice(0, 500), new Date().toISOString()).run()
}

// sync.ts fires several whoopFetch() calls concurrently (Promise.allSettled), and each
// independently checks token expiry - without this guard, every one of them would see the same
// near-expiry token and race to refresh it in parallel. Whoop invalidates a refresh_token as soon
// as the first request consumes it, so the other concurrent calls would reuse an already-dead
// token and fail (and, worse, permanently kill the connection until a manual reconnect). Sharing a
// single in-flight refresh across concurrent callers on this isolate avoids that entirely.
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
    const detail = `${res.status} ${(await res.text()).slice(0, 200)}`
    // 4xx means the grant itself was rejected (revoked in the Whoop app, expired, already used).
    // A 5xx is Whoop having a moment — leave the connection alone and retry on the next run.
    if (res.status >= 400 && res.status < 500) {
      await revokeWhoopTokens(db, `Whoop rejected the saved credentials (${detail}). Reconnect to restore syncing.`)
      throw createError({ statusCode: 401, message: 'Whoop connection expired — reconnect to restore syncing' })
    }
    throw createError({ statusCode: 502, message: `Whoop token refresh failed: ${detail}` })
  }

  const data = await res.json<{ access_token?: string, refresh_token?: string, expires_in?: number }>()
  if (!data.access_token || !data.refresh_token || typeof data.expires_in !== 'number') {
    throw createError({ statusCode: 502, message: 'Whoop token refresh returned an unexpected payload' })
  }
  const tokens: WhoopTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000
  }
  await saveWhoopTokens(db, tokens)
  return tokens
}

async function accessToken(db: D1Database): Promise<string> {
  let tokens = await getWhoopTokens(db)
  if (!tokens) {
    throw createError({ statusCode: 401, message: 'Whoop is not connected' })
  }
  if (tokens.expires_at - Date.now() < REFRESH_BUFFER_MS) {
    tokens = await refreshWhoopTokenOnce(db, tokens.refresh_token)
  }
  return tokens.access_token
}

interface WhoopPage<T> {
  records?: T[]
  next_token?: string | null
}

/**
 * Every record in a collection from `start` onward, following `next_token` across pages.
 *
 * Paging matters after an outage: a single page is at most 25 records, so a connection that was
 * down for a few days used to come back and silently leave the gap unfilled. `maxPages` bounds
 * the worst case, and a repeated or empty token ends the walk.
 */
export async function whoopFetchAll<T>(db: D1Database, path: string, opts: { start?: string, maxPages?: number } = {}): Promise<T[]> {
  const token = await accessToken(db)
  const records: T[] = []
  const seenTokens = new Set<string>()
  let nextToken: string | undefined

  for (let page = 0; page < (opts.maxPages ?? MAX_PAGES); page++) {
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) })
    if (opts.start) params.set('start', opts.start)
    if (nextToken) params.set('nextToken', nextToken)

    const res = await fetch(`${WHOOP_API_BASE}${path}?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) {
      throw createError({ statusCode: 502, message: `Whoop API request failed: ${res.status} ${(await res.text()).slice(0, 200)}` })
    }

    const body = await res.json<WhoopPage<T>>()
    records.push(...(body.records ?? []))

    const next = body.next_token
    // No token, an empty page, or a token we've already followed: stop rather than loop.
    if (!next || seenTokens.has(next) || !(body.records ?? []).length) break
    seenTokens.add(next)
    nextToken = next
  }

  return records
}
