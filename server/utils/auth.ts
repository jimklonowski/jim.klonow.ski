import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Role } from '#shared/utils/access'

// Cookie auth with HMAC-signed tokens (key: LABS_SECRET). Replaces the old scheme where the
// cookie value was LABS_SECRET itself — a bearer copy of the signing secret that couldn't be
// rotated per-device, expire, or carry a role. Tokens carry a role (owner|friend|doctor) and
// expiry; guest tokens also carry the invite id that minted them, so revoking an invite kills
// every session it produced (liveness checked in server/middleware/auth.ts).
//
// Verification is synchronous (node:crypto HMAC, available via nodejs_compat) so the middleware
// can attach the result to event.context.auth and endpoint helpers stay sync — the 28 existing
// requireLabsAuth() call sites keep working unchanged.

const AUTH_COOKIE = 'labs-auth'
const UPLOAD_COOKIE = 'labs-upload-auth'
const SESSION_DAYS = 30
const UPLOAD_SESSION_HOURS = 12

const ROLES: readonly Role[] = ['owner', 'friend', 'doctor', 'demo'] as const

export interface AuthContext {
  role: Role
  inviteId: string | null
  /** When the token was minted (unix seconds); 0 for tokens from before `iat` existed. */
  issuedAt: number
}

interface TokenPayload {
  r: string
  i?: string
  exp: number // unix seconds
  /** Issued-at, unix seconds. Checked against the owner session cutoff (sign out everywhere). */
  iat?: number
}

function signingKey(): string {
  const secret = process.env.LABS_SECRET
  if (!secret) throw createError({ statusCode: 500, message: 'LABS_SECRET is not configured' })
  return secret
}

function sign(payloadB64: string): string {
  return createHmac('sha256', signingKey()).update(payloadB64).digest('base64url')
}

function mintToken(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `v1.${body}.${sign(body)}`
}

function verifyToken(token: string | undefined): TokenPayload | null {
  if (!token) return null
  const [version, body, sig] = token.split('.')
  if (version !== 'v1' || !body || !sig) return null
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null
    return payload
  }
  catch {
    return null
  }
}

// --- Session cookie ---

export function readAuthCookie(event: H3Event): AuthContext | null {
  const payload = verifyToken(getCookie(event, AUTH_COOKIE))
  if (!payload || !ROLES.includes(payload.r as Role)) return null
  return { role: payload.r as Role, inviteId: payload.i ?? null, issuedAt: payload.iat ?? 0 }
}

export function setAuthCookie(event: H3Event, role: Role, inviteId?: string, maxAge = SESSION_DAYS * 86400) {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + maxAge
  setCookie(event, AUTH_COOKIE, mintToken({ r: role, ...(inviteId ? { i: inviteId } : {}), exp, iat }), {
    httpOnly: true,
    secure: true,
    maxAge,
    path: '/',
    sameSite: 'lax'
  })
}

export function clearAuthCookies(event: H3Event) {
  deleteCookie(event, AUTH_COOKIE, { path: '/' })
  deleteCookie(event, UPLOAD_COOKIE, { path: '/' })
}

// --- Endpoint guards (read event.context.auth, set once per request by the middleware) ---

export function getAuth(event: H3Event): AuthContext | null {
  return (event.context.auth as AuthContext | null | undefined) ?? null
}

// Kept name from the pre-roles scheme — called by every read endpoint. Any valid role passes.
export function requireLabsAuth(event: H3Event): AuthContext {
  const auth = getAuth(event)
  if (!auth) throw createError({ statusCode: 401, message: 'Unauthorized' })
  return auth
}

export function requireOwner(event: H3Event): AuthContext {
  const auth = requireLabsAuth(event)
  if (auth.role !== 'owner') throw createError({ statusCode: 403, message: 'Owner access required' })
  return auth
}

// Demo sessions are short-lived (the sandbox resets nightly anyway) and deliberately
// overwrite whatever labs-auth cookie is present — visiting /demo from an owner/friend/doctor
// session hands that session over to the sandbox until the next sign-in.
const DEMO_SESSION_SECONDS = 86400

export function startDemoSession(event: H3Event) {
  setAuthCookie(event, 'demo', undefined, DEMO_SESSION_SECONDS)
}

// Writes that are safe to open to demo sessions (journal days, sodas, supplements, vials):
// for the demo role, getDb() routes every statement into the sandbox DEMO_DB, so these
// endpoints work unchanged. Everything else that writes stays requireOwner.
export function requireWriteAccess(event: H3Event): AuthContext {
  const auth = requireLabsAuth(event)
  if (auth.role !== 'owner' && auth.role !== 'demo') {
    throw createError({ statusCode: 403, message: 'Not available for this role' })
  }
  return auth
}

export function requireRole(event: H3Event, ...roles: Role[]): AuthContext {
  const auth = requireLabsAuth(event)
  if (!roles.includes(auth.role)) throw createError({ statusCode: 403, message: 'Not available for this role' })
  return auth
}

// --- Upload PIN second factor: a signed session token (12h), not the PIN itself ---

export function setUploadCookie(event: H3Event) {
  const iat = Math.floor(Date.now() / 1000)
  setCookie(event, UPLOAD_COOKIE, mintToken({ r: 'upload', exp: iat + UPLOAD_SESSION_HOURS * 3600, iat }), {
    httpOnly: true,
    secure: true,
    path: '/',
    sameSite: 'lax'
  })
}

/** Async since it reads the session cutoff: a PIN unlocked before "sign out everywhere" is dead too. */
export async function requireUploadPin(event: H3Event) {
  const payload = verifyToken(getCookie(event, UPLOAD_COOKIE))
  if (!payload || payload.r !== 'upload' || (payload.iat ?? 0) < await ownerSessionCutoff(event)) {
    throw createError({ statusCode: 403, message: 'Upload PIN required' })
  }
}

// --- Sign out everywhere ---

// Owner sessions are self-contained signed tokens, so there was no way to end one before its
// 30 days ran out — a lost laptop stayed signed in. "Sign out everywhere" stores a cutoff time,
// and any owner or upload token minted before it is refused (the middleware checks owner
// sessions; requireUploadPin checks its own). Guests don't need this: revoking their invite
// already ends every session it minted. Tokens from before `iat` existed read as issued at 0,
// so the first cutoff signs them all out too.
//
// The cutoff lives in the RATE_LIMIT KV namespace under its own key rather than in D1: KV is read
// at the edge, so an owner request pays microseconds for the check instead of a database round
// trip. KV is eventually consistent (up to about a minute across locations), which is fine for a
// panic button; the device that pressed it gets a fresh token at once.
const CUTOFF_KEY = 'auth:owner-session-cutoff'
// Per-isolate memo so a page's burst of API calls reads KV once, not per request.
const CUTOFF_MEMO_MS = 15_000
let cutoffMemo: { value: number, at: number } | null = null

function sessionKv(event: H3Event): KVNamespace {
  return (event.context.cloudflare.env as unknown as Env).RATE_LIMIT
}

/** Owner and upload tokens issued before this (unix seconds) are refused. 0 = no cutoff set. */
export async function ownerSessionCutoff(event: H3Event): Promise<number> {
  if (cutoffMemo && Date.now() - cutoffMemo.at < CUTOFF_MEMO_MS) return cutoffMemo.value
  let value = 0
  try {
    value = Number(await sessionKv(event).get(CUTOFF_KEY)) || 0
  }
  catch (err) {
    // An unreadable KV must not lock the owner out of their own site; log and allow.
    console.error('session cutoff: KV read failed:', err instanceof Error ? err.message : err)
  }
  cutoffMemo = { value, at: Date.now() }
  return value
}

/**
 * Ends every owner session and upload unlock issued before now, on every device, then signs
 * this device back in with a fresh token — so "sign out everywhere else" is one click.
 */
export async function signOutEverywhereElse(event: H3Event) {
  const now = Math.floor(Date.now() / 1000)
  await sessionKv(event).put(CUTOFF_KEY, String(now))
  cutoffMemo = { value: now, at: Date.now() }
  setAuthCookie(event, 'owner')
  deleteCookie(event, UPLOAD_COOKIE, { path: '/' })
}

// --- Invites ---

/** The token that goes in the share URL. Shown to the owner once, never stored as-is. */
export function newInviteToken(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * The stored form of a share token: `invites.id` holds this, not the token itself.
 *
 * The token IS the credential — anyone holding it can mint a friend or doctor session — and it
 * used to sit in the database in the clear, so every copy of the data carried every live link.
 * That includes the plaintext dump `pnpm sync:local` writes to the OS temp directory. Storing
 * only the digest means a leaked export reveals nothing usable.
 *
 * Plain SHA-256 with no salt or stretching is the right primitive here (unlike a password):
 * the input is 24 random bytes, so there is no dictionary to run and nothing to slow down, and
 * a deterministic digest is what lets the redeem lookup be a single indexed read.
 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// --- Shared-secret compare ---

/**
 * Constant-time equality for presented credentials (owner password, upload PIN, webhook bearer).
 * A plain `!==` returns at the first differing byte, which leaks how much of a guess was right;
 * the rate limits on those routes make that impractical to exploit, but there is no reason to
 * leak at all. Rejects non-strings and an unset expected value (an unconfigured secret must
 * never compare equal to anything).
 */
export function safeEqual(given: unknown, expected: string | undefined | null): boolean {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    // Still burn one comparison so the length mismatch isn't itself a timing tell.
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}
