import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'

// Conditional GETs for the JSON list endpoints. The response gets an ETag over its exact body
// and `Cache-Control: private, no-cache`, which the browser's own HTTP cache understands: it
// keeps the body, sends If-None-Match on the next fetch, and on a 304 hands the cached body back
// to $fetch as though it were fresh. No client code changes, and every revisit of a page whose
// data hasn't moved skips the multi-hundred-KB download (the journal list alone is ~half a MB).
//
// The query still runs — this saves the transfer, not the D1 read. The tag is over the body the
// caller would actually receive, after role projection, so a doctor and an owner can never share
// a 304 (and `private` keeps shared caches out of it entirely).

/**
 * Returns `data` serialized, with an ETag; a 304 when the client already has exactly this body.
 * Typed as `T` so handlers keep their inferred response type for the client.
 */
export function withEtag<T>(event: H3Event, data: T): T {
  const body = JSON.stringify(data)
  const tag = `W/"${createHash('sha1').update(body).digest('base64url')}"`
  setHeader(event, 'ETag', tag)
  setHeader(event, 'Cache-Control', 'private, no-cache')
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')

  const ifNoneMatch = getRequestHeader(event, 'if-none-match')
  if (ifNoneMatch && ifNoneMatch.split(',').map(t => t.trim()).includes(tag)) {
    return new Response(null, { status: 304, headers: { 'ETag': tag, 'Cache-Control': 'private, no-cache' } }) as unknown as T
  }
  // Already serialized for the hash; hand h3 the string rather than make it stringify twice.
  return body as unknown as T
}
