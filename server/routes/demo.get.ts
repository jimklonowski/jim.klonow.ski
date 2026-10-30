// Public demo entry: jim.klonow.ski/demo mints a 24h demo-role session (replacing any
// existing owner/friend/doctor cookie — it's the same labs-auth cookie) and lands on the
// home mission control. A plain GET so the link is shareable and works from anywhere;
// rate-limited via routeRules in nuxt.config. The redirect is a full page load, which is
// what keeps the role-change safe for the SSR payload cache (same invariant as login).
//
// Except that "from anywhere" let any other site sign the owner out of their own session: a link
// or a redirect to /demo carries the Lax cookie, the owner cookie was replaced, and the next
// quick-logs went quietly into the sandbox that resets overnight (audit #43 item 19). A real
// session arriving from another site now gets a page asking first; its "continue" is a same-site
// navigation, which no other site can forge. A visitor with no session — or a demo one, or the
// owner typing the URL — goes straight in as before.
const ROLE_NAMES: Record<string, string> = { owner: 'the owner', friend: 'a friend', doctor: 'a doctor' }

export default defineEventHandler((event) => {
  const current = readAuthCookie(event)
  if (current && current.role !== 'demo' && isCrossSite(event)) {
    setResponseHeaders(event, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' })
    setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Open the demo?</title></head>
<body>
<main>
<h1>Open the demo?</h1>
<p>You're signed in to jim.klonow.ski as ${ROLE_NAMES[current.role] ?? 'a guest'}. The demo replaces that session with a 24-hour demo one, so you'd need to sign in again afterwards.</p>
<p><a href="/demo">Continue to the demo</a> · <a href="/">Stay signed in</a></p>
</main>
</body>
</html>`
  }
  startDemoSession(event)
  return sendRedirect(event, '/', 302)
})
