// Signs this browser out. No session is needed (an expired one should still clear its cookies),
// but the request has to come from this site: see requireSameOrigin in server/utils/auth.ts.
export default defineEventHandler((event) => {
  requireSameOrigin(event)
  clearAuthCookies(event)
  return { ok: true }
})
