import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
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

const ROLES: readonly Role[] = ['owner', 'friend', 'doctor'] as const

export interface AuthContext {
  role: Role
  inviteId: string | null
}

interface TokenPayload {
  r: string
  i?: string
  exp: number // unix seconds
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
  return { role: payload.r as Role, inviteId: payload.i ?? null }
}

export function setAuthCookie(event: H3Event, role: Role, inviteId?: string) {
  const maxAge = SESSION_DAYS * 86400
  const exp = Math.floor(Date.now() / 1000) + maxAge
  setCookie(event, AUTH_COOKIE, mintToken({ r: role, ...(inviteId ? { i: inviteId } : {}), exp }), {
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

export function requireRole(event: H3Event, ...roles: Role[]): AuthContext {
  const auth = requireLabsAuth(event)
  if (!roles.includes(auth.role)) throw createError({ statusCode: 403, message: 'Not available for this role' })
  return auth
}

// --- Upload PIN second factor: a signed session token (12h), not the PIN itself ---

export function setUploadCookie(event: H3Event) {
  const exp = Math.floor(Date.now() / 1000) + UPLOAD_SESSION_HOURS * 3600
  setCookie(event, UPLOAD_COOKIE, mintToken({ r: 'upload', exp }), {
    httpOnly: true,
    secure: true,
    path: '/',
    sameSite: 'lax'
  })
}

export function requireUploadPin(event: H3Event) {
  const payload = verifyToken(getCookie(event, UPLOAD_COOKIE))
  if (!payload || payload.r !== 'upload') {
    throw createError({ statusCode: 403, message: 'Upload PIN required' })
  }
}

// --- Invites ---

export function newInviteToken(): string {
  return randomBytes(24).toString('base64url')
}
