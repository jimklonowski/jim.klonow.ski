import { deflateSync } from 'node:zlib'
import type { H3Event } from 'h3'
import { localTimeNow, localToday } from '#shared/utils/time'
import { loggedStreak } from '#shared/utils/journalLog'
import { ageDays, publicWardrobeOf } from '#shared/utils/tickerWardrobe'
import { renderTickerCard } from '#shared/utils/tickerCard'
import { encodePng } from '#shared/utils/pixelCanvas'

// The Open Graph image for /ticker — public, since crawlers hold no session. The page itself is
// gated, so a pasted link lands on /labs/login?for=ticker, whose head points here.
//
// What it shows: the pet in its PUBLIC outfit (publicWardrobeOf — the earned wearables and the
// tier, which are counts of logging and exercise; never the finasteride mane or the DEXA arms and
// belly), asleep after bedtime, and two figures: its age and the logged streak. Nothing else from
// the log reaches the raster.
//
// What it costs: three full-table reads and a PNG encode, ~30 ms of CPU. The URL is fixed, so the
// result is served from the edge cache for an hour. Cache-Control on its own would not do that —
// Cloudflare doesn't cache a Worker's response unless the Worker writes it through the Cache API —
// so an unfurl used to reach D1 every time. The key is the bare path (a query string can't bust
// it), and a per-isolate memo sits in front for `nuxt dev` (no Cache API in Node) and for the
// moments before the edge write lands. A rateLimiter rule in nuxt.config caps one IP on top.

const MAX_AGE_SECONDS = 3600
const CACHE_CONTROL = `public, max-age=${MAX_AGE_SECONDS}`

/** The Workers Cache API's default cache — the DOM typings don't know `caches.default`. */
interface EdgeCache {
  match(key: Request): Promise<Response | undefined>
  put(key: Request, response: Response): Promise<void>
}
function edgeCache(): EdgeCache | null {
  return typeof caches === 'undefined' ? null : (caches as unknown as { default?: EdgeCache }).default ?? null
}

let memo: { at: number, png: Uint8Array<ArrayBuffer> } | null = null

export default defineEventHandler(async (event) => {
  if (memo && Date.now() - memo.at < MAX_AGE_SECONDS * 1000) return send(event, memo.png, 'memo')

  const url = getRequestURL(event)
  const cacheKey = new Request(`${url.origin}${url.pathname}`)
  const cache = edgeCache()

  const hit = await cache?.match(cacheKey)
  if (hit) {
    const png = new Uint8Array(await hit.arrayBuffer())
    // The memo expires with the edge copy, not an hour after this isolate first saw it.
    memo = { at: Date.now() - Number(hit.headers.get('age') ?? 0) * 1000, png }
    return send(event, png, 'edge')
  }

  const png = (await renderCard(event)) as Uint8Array<ArrayBuffer>
  memo = { at: Date.now(), png }
  if (cache) {
    const stored = new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': CACHE_CONTROL } })
    event.waitUntil(cache.put(cacheKey, stored).catch(() => { /* the memo and the next miss cover it */ }))
  }
  return send(event, png, 'render')
})

/** `X-Card-Source` says which path answered — the way to see the caching work from `curl -I`. */
function send(event: H3Event, png: Uint8Array, source: 'memo' | 'edge' | 'render') {
  setHeader(event, 'Content-Type', 'image/png')
  setHeader(event, 'Cache-Control', CACHE_CONTROL)
  setHeader(event, 'X-Card-Source', source)
  return Buffer.from(png)
}

async function renderCard(event: H3Event): Promise<Uint8Array> {
  const entries = await listRows(event, 'SELECT * FROM journal_entries ORDER BY date ASC', parseJournalRow)
  const workouts = await listRows(event, 'SELECT date, duration_min FROM workouts', r => ({
    date: String(r.date),
    duration_min: r.duration_min == null ? null : Number(r.duration_min)
  }))
  const scans = await listRows(event, 'SELECT * FROM dexa_entries ORDER BY date ASC', parseDexaRow)

  const today = localToday()
  const hour = Number(localTimeNow().slice(0, 2))
  const { accessories, build } = publicWardrobeOf({ entries, workouts, scans, today })
  const raster = renderTickerCard({
    accessories,
    build,
    asleep: hour >= 22 || hour < 6,
    ageDays: ageDays(entries, today),
    streak: loggedStreak(entries, today),
    site: 'jim.klonow.ski'
  })
  return encodePng(raster, bytes => new Uint8Array(deflateSync(bytes)))
}
