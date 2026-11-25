// The service worker (public/sw.js) and its offline page (public/offline.html) — audit #44
// item 54. The worker's handlers are run here against a fake network and a fake cache: it must
// answer page loads only, from the network first, fall back to the offline page when nothing
// answers, and keep nothing of the site. The page must stand entirely on its own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const source = read('public/sw.js')

/** The worker, loaded into a fake scope: its listeners, its caches, and a network to script. */
function boot() {
  const listeners = {}
  const stores = new Map()
  const log = { fetched: [], skipWaiting: 0, claimed: 0 }
  const network = { online: true, answer: () => new Response('<html>the page</html>', { status: 200 }) }
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map())
      const store = stores.get(name)
      return {
        async put(url, response) {
          store.set(url, response)
        }
      }
    },
    async keys() {
      return [...stores.keys()]
    },
    async delete(name) {
      return stores.delete(name)
    },
    async match(url) {
      for (const store of stores.values()) {
        const hit = store.get(url)
        if (hit) return hit.clone()
      }
      return undefined
    }
  }
  const fetch = async (request) => {
    log.fetched.push({ url: request.url, cache: request.cache })
    if (!network.online) throw new TypeError('Failed to fetch')
    return network.answer(request)
  }
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn },
    skipWaiting: async () => { log.skipWaiting++ },
    clients: { claim: async () => { log.claimed++ } }
  }
  class FakeRequest {
    constructor(url, init = {}) {
      Object.assign(this, { url, method: 'GET', mode: 'cors', cache: 'default' }, init)
    }
  }
  new Function('self', 'caches', 'fetch', 'Request', 'Response', source)(self, caches, fetch, FakeRequest, Response)
  /** Runs a lifecycle event to the end of its waitUntil. */
  const lifecycle = async (type) => {
    let done
    listeners[type]({ waitUntil: p => void (done = p) })
    await done
  }
  /** Fires a fetch event; resolves to the response the worker answered with, or undefined when it stood aside. */
  const request = async (init) => {
    let answered
    listeners.fetch({ request: new FakeRequest(init.url ?? 'https://site.test/journal', init), respondWith: p => void (answered = p) })
    return answered
  }
  return { listeners, stores, log, network, lifecycle, request }
}

test('installing stores the offline page, fresh from the server, and nothing else', async () => {
  const sw = boot()
  sw.network.answer = () => new Response('<html>offline</html>', { status: 200 })
  await sw.lifecycle('install')
  assert.deepEqual(sw.log.fetched, [{ url: '/offline.html', cache: 'reload' }])
  assert.deepEqual([...sw.stores.keys()], ['offline-v1'])
  assert.deepEqual([...sw.stores.get('offline-v1').keys()], ['/offline.html'])
  assert.equal(sw.log.skipWaiting, 1, 'a new version does not wait for old tabs to close')
})

test('an offline page that arrived through a redirect is stored as a clean copy, and one that did not load is not stored', async () => {
  // Cloudflare answers /offline.html with a redirect to /offline; the response fetch hands back
  // says so, and a browser will not take such a response as the answer to a page load.
  const sw = boot()
  sw.network.answer = () => Object.defineProperty(new Response('<html>offline</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }), 'redirected', { value: true })
  await sw.lifecycle('install')
  const kept = sw.stores.get('offline-v1').get('/offline.html')
  assert.equal(kept.redirected, false, 'no redirect in its past')
  assert.equal(kept.status, 200)
  assert.equal(kept.headers.get('content-type'), 'text/html; charset=utf-8')
  sw.network.online = false
  assert.equal(await (await sw.request({ mode: 'navigate' })).text(), '<html>offline</html>')

  const broken = boot()
  broken.network.answer = () => new Response('not found', { status: 404 })
  await assert.rejects(() => broken.lifecycle('install'), /the offline page answered 404/)
  assert.equal(broken.stores.get('offline-v1').size, 0, 'an error page is never kept as the offline page')
})

test('activating removes the caches of any other version and takes over open pages', async () => {
  const sw = boot()
  sw.stores.set('offline-v0', new Map())
  sw.stores.set('some-old-cache', new Map())
  await sw.lifecycle('install')
  await sw.lifecycle('activate')
  assert.deepEqual([...sw.stores.keys()], ['offline-v1'])
  assert.equal(sw.log.claimed, 1)
})

test('only page loads are answered: scripts, the API and writes go straight past', async () => {
  const sw = boot()
  await sw.lifecycle('install')
  sw.log.fetched.length = 0
  for (const init of [
    { url: 'https://site.test/_nuxt/entry.js', mode: 'no-cors' },
    { url: 'https://site.test/api/journal/list', mode: 'cors' },
    { url: 'https://site.test/api/journal/water', mode: 'cors', method: 'POST' },
    { url: 'https://site.test/journal', mode: 'navigate', method: 'POST' },
    { url: 'https://site.test/icon-192.png', mode: 'no-cors' }
  ]) {
    assert.equal(await sw.request(init), undefined, `${init.method ?? 'GET'} ${init.url} (${init.mode})`)
  }
  assert.deepEqual(sw.log.fetched, [], 'and it asked the network for nothing itself')
})

test('a page load is the network\'s answer, whatever it is, and none of it is kept', async () => {
  const sw = boot()
  await sw.lifecycle('install')
  sw.network.answer = () => new Response('<html>journal</html>', { status: 200 })
  assert.equal(await (await sw.request({ mode: 'navigate' })).text(), '<html>journal</html>')
  sw.network.answer = () => new Response('sign in', { status: 401 })
  assert.equal((await sw.request({ mode: 'navigate' })).status, 401, 'an error page from the server is shown as it is')
  sw.network.answer = () => new Response('broken', { status: 503 })
  assert.equal((await sw.request({ mode: 'navigate' })).status, 503, 'a 503 is the server speaking, not "offline"')
  assert.deepEqual([...sw.stores.get('offline-v1').keys()], ['/offline.html'], 'no page was cached')
})

test('a page load with no network is the offline page', async () => {
  const sw = boot()
  sw.network.answer = () => new Response('<html>offline</html>', { status: 200 })
  await sw.lifecycle('install')
  sw.network.online = false
  const res = await sw.request({ url: 'https://site.test/journal', mode: 'navigate' })
  assert.equal(res.status, 200)
  assert.equal(await res.text(), '<html>offline</html>')
  // Twice: the stored copy is handed out as a clone, not used up.
  assert.equal(await (await sw.request({ url: 'https://site.test/labs', mode: 'navigate' })).text(), '<html>offline</html>')
})

test('if the offline page was never stored, a failed load is a plain network error — not a crash', async () => {
  const sw = boot()
  sw.network.online = false
  await assert.rejects(() => sw.lifecycle('install'), /Failed to fetch/, 'installing offline fails, so the browser keeps the old worker')
  const res = await sw.request({ mode: 'navigate' })
  assert.equal(res.type, 'error')
})

test('the offline page stands alone, and counts the same outbox the app writes', () => {
  const html = read('public/offline.html')
  // Nothing fetched from anywhere: no stylesheet, script, image, font or frame by address.
  assert.doesNotMatch(html, /<link\b/i, 'no linked stylesheet, icon or manifest')
  assert.doesNotMatch(html, /\bsrc\s*=/i, 'no script, image or frame by address')
  assert.doesNotMatch(html, /url\(/i, 'no font or image from CSS')
  assert.doesNotMatch(html, /https?:\/\//i, 'no absolute address at all')
  assert.match(html, /<meta name="robots" content="noindex">/)
  // The retry works without the script: an empty href asks for the page that was asked for.
  assert.match(html, /<a class="btn" href="">TRY AGAIN<\/a>/)
  // The outbox key is the app's own.
  const key = /const KEY = '([^']+)'/.exec(read('app/composables/useQuickLogOutbox.ts'))?.[1]
  assert.equal(key, 'quicklog:outbox')
  assert.ok(html.includes(`localStorage.getItem('${key}')`), 'the page reads the app\'s outbox')
  // And the worker names the page that exists, and the plugin the worker that exists.
  assert.match(source, /const OFFLINE_URL = '\/offline\.html'/)
  assert.match(read('app/plugins/sw.client.ts'), /register\('\/sw\.js', \{ scope: '\/', updateViaCache: 'none' \}\)/)
})
