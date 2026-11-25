// The site's service worker. It has one job: when a PAGE is asked for and the network does not
// answer, show /offline.html instead of the browser's own dead end — which, for the home-screen
// app opened with no signal, was a blank screen with no way to tell what happened or to retry
// (audit #44 item 54).
//
// It is kept this small on purpose:
//   - only page loads (navigations) are answered here, and always from the network first. Scripts,
//     styles, images, the API and every write go straight past, untouched;
//   - nothing of the site is cached — not a page, not a response. The pages are personal and
//     behind a login; the only thing ever stored is the offline page itself;
//   - a new version takes over at once (skipWaiting + claim) and removes the caches of the old.
// To retire it, ship a version whose fetch handler is gone: the site then behaves as if it had
// never been installed.
//
// Plain JavaScript, served as written from /sw.js (app/plugins/sw.client.ts registers it).
// tests/serviceWorker.test.mjs runs this file's handlers against a fake network.

const VERSION = 'v1'
const CACHE = `offline-${VERSION}`
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // `reload`: the copy kept is the server's own, never one out of the HTTP cache.
    const response = await fetch(new Request(OFFLINE_URL, { cache: 'reload' }))
    if (!response.ok) throw new TypeError(`the offline page answered ${response.status}`)
    // Cloudflare serves /offline.html by redirecting to /offline, and a browser refuses a
    // response that came through a redirect as the answer to a page load (the load fails
    // outright). So what is kept is a clean copy of the body, with no redirect in its past.
    const page = response.redirected
      ? new Response(await response.blob(), { status: 200, headers: response.headers })
      : response
    await cache.put(OFFLINE_URL, page)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.mode !== 'navigate' || request.method !== 'GET') return
  event.respondWith((async () => {
    try {
      // Whatever the server says — a page, a redirect, an error page — is what is shown.
      return await fetch(request)
    }
    catch {
      // No answer at all: the offline page, under the address that was asked for, so its
      // "try again" asks for the same page.
      const offline = await caches.match(OFFLINE_URL)
      return offline ?? Response.error()
    }
  })())
})
