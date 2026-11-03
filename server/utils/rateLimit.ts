import type { H3Event } from 'h3'

// Per-IP brakes on the routes a stranger can call, through the Workers Rate Limiting bindings
// declared in wrangler.jsonc (audit #43 item 47). The binding counts in the location the request
// hit and answers at once; nuxt-security's KV limiter (routeRules in nuxt.config) still keeps
// the longer windows on the credential routes, but KV is eventually consistent — a burst of
// guesses could run far past its count before the counters agreed — and /api/health, built for
// an uptime monitor, had no limit at all while costing four D1 queries a call.
//
//   credentials  5 / minute   sign-in, upload PIN, share-link redemption — one counter per route
//   public      30 / minute   /api/health (a monitor polls once a minute or so), /demo
//
// Fails OPEN: a missing binding (a local proxy without one) is logged once and not enforced, and
// a binding that throws lets the request through — a limiter outage must never lock the owner
// out of their own site. The KV window is the backstop either way.

type Limiter = 'credentials' | 'public'
const BINDING: Record<Limiter, 'LIMIT_CREDENTIALS' | 'LIMIT_PUBLIC'> = {
  credentials: 'LIMIT_CREDENTIALS',
  public: 'LIMIT_PUBLIC'
}
const warned = new Set<Limiter>()

/** The caller's address as Cloudflare saw it (cf-connecting-ip is set by the edge, unspoofable). */
export function clientIp(event: H3Event): string {
  return getHeader(event, 'cf-connecting-ip') || getRequestIP(event, { xForwardedFor: false }) || 'unknown'
}

/** Refuses with 429 once this IP has used up `limiter`'s allowance for `scope` in the period. */
export async function enforceRateLimit(event: H3Event, limiter: Limiter, scope: string): Promise<void> {
  const env = (event.context.cloudflare as unknown as { env?: Partial<Env> } | undefined)?.env
  const binding = env?.[BINDING[limiter]]
  if (!binding) {
    if (!warned.has(limiter)) {
      warned.add(limiter)
      logWarn('rate-limit', `${BINDING[limiter]} binding missing — ${limiter} limit not enforced`)
    }
    return
  }
  let success: boolean
  try {
    ({ success } = await binding.limit({ key: `${scope}:${clientIp(event)}` }))
  }
  catch (err) {
    logError('rate-limit', `${scope}: limit() failed`, err)
    return
  }
  if (!success) {
    setHeader(event, 'Retry-After', 60)
    throw createError({ statusCode: 429, message: 'Too many requests — try again in a minute' })
  }
}
