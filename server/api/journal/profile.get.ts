import type { Profile } from '#shared/utils/profile'

// Readable by every authenticated role — blood type is exactly what a clinician asks first.
//
// Demo used to short-circuit to an empty card; the sandbox now carries a blood type of its own
// (scripts/demo/generate-demo-data.mjs), so it reads like any other role. The catch below still
// covers a sandbox that hasn't had schema.sql applied yet.
export default defineEventHandler(async (event): Promise<Profile> => {
  requireLabsAuth(event)

  const db = getDb(event)
  try {
    const { results } = await db.prepare('SELECT key, value FROM profile').all<{ key: string, value: string }>()
    return Object.fromEntries((results ?? []).map(r => [r.key, r.value]))
  }
  catch (err) {
    // Missing table (migration not applied yet) reads as "nothing recorded", not a 500. Any
    // other error is a real failure and must not read as "no blood type on file".
    if (isMissingTable(err)) return {}
    throw err
  }
})
