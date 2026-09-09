import type { Profile } from '#shared/utils/profile'

// Readable by every authenticated role — blood type is exactly what a clinician asks first.
// Demo gets an empty card: the sandbox DB has no profile table and the persona has no facts.
export default defineEventHandler(async (event): Promise<Profile> => {
  const auth = requireLabsAuth(event)
  if (auth.role === 'demo') return {}

  const db = getDb(event)
  try {
    const { results } = await db.prepare('SELECT key, value FROM profile').all<{ key: string, value: string }>()
    return Object.fromEntries((results ?? []).map(r => [r.key, r.value]))
  }
  catch {
    // Missing table (migration not applied yet) reads as "nothing recorded", not a 500.
    return {}
  }
})
