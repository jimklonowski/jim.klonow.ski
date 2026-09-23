import type { H3Event } from 'h3'

// R2 objects are private; the lab-PDF and progress-photo proxies serve them after their own
// auth check (who may read which key differs per bucket). This is everything after that check.
//
// Repeat views revalidate instead of re-downloading: R2 gives every object an etag, so a
// matching If-None-Match gets an empty 304. The photo grid re-requests the same thumbnails on
// every visit once the hour of `max-age` is up, and a multi-MB lab PDF is the same.

/** Stream `key` from `bucket`, or 404. `fallbackType` covers objects stored without a content type. */
export async function serveR2Object(event: H3Event, bucket: R2Bucket, key: string, fallbackType: string): Promise<Response> {
  const object = await bucket.get(key)
  if (!object) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType ?? fallbackType,
    'Cache-Control': 'private, max-age=3600',
    'ETag': object.httpEtag
  })

  const ifNoneMatch = getRequestHeader(event, 'if-none-match')
  if (ifNoneMatch && ifNoneMatch.split(',').map(t => t.trim()).includes(object.httpEtag)) {
    // The body is already streaming from R2; cancel it rather than leave it open.
    await object.body.cancel()
    return new Response(null, { status: 304, headers })
  }

  headers.set('Content-Length', String(object.size))
  return new Response(object.body, { headers })
}
