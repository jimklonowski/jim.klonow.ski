// RFC 7396 JSON merge patch: objects merge key by key, a null removes the key, anything else
// (an array, a scalar, an object over a non-object) replaces. The same rule SQLite's json_patch()
// applies on the server (server/utils/tickerState.ts mergeTickerState), so the /ticker page's
// mirror of the pet's memory lands exactly where the stored copy does. App-import-free for the
// plain-node tests.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function mergePatch(target: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch)) return patch
  const base = isPlainObject(target) ? target : {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(base)) {
    if (!(key in patch)) out[key] = value
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) continue // a null removes the key
    out[key] = isPlainObject(value) ? mergePatch(base[key], value) : value
  }
  return out
}
