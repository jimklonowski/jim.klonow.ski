import type { Profile } from '#shared/utils/profile'

// Readable by every authenticated role — blood type is exactly what a clinician asks first.
//
// Demo used to short-circuit to an empty card; the sandbox now carries a blood type of its own
// (scripts/demo/generate-demo-data.mjs), so it reads like any other role. `missingTableOk` below still
// covers a sandbox that hasn't had schema.sql applied yet.
export default defineEventHandler(async (event): Promise<Profile> => {
  requireLabsAuth(event)

  // Missing table (migration not applied yet) reads as "nothing recorded", not a 500. Any other
  // error is a real failure and must not read as "no blood type on file".
  const rows = await listRows(event, 'SELECT key, value FROM profile', r => [r.key as string, r.value as string] as const, { missingTableOk: true })
  return withEtag(event, Object.fromEntries(rows))
})
