// Public demo entry: jim.klonow.ski/demo mints a 24h demo-role session (replacing any
// existing owner/friend/doctor cookie — it's the same labs-auth cookie) and lands on the
// home mission control. A plain GET so the link is shareable and works from anywhere;
// rate-limited via routeRules in nuxt.config. The redirect is a full page load, which is
// what keeps the role-change safe for the SSR payload cache (same invariant as login).
export default defineEventHandler((event) => {
  startDemoSession(event)
  return sendRedirect(event, '/', 302)
})
