import type { Vaccination } from '#shared/utils/vaccines'

// Readable by every authenticated role — an immunization record is exactly the history a
// doctor viewer wants, same policy as the supplement stack. Demo gets an empty list rather
// than a query: the sandbox DB has no vaccinations table and the persona has no shots.
export default defineEventHandler(async (event): Promise<Vaccination[]> => {
  const auth = requireLabsAuth(event)
  if (auth.role === 'demo') return []

  const db = getDb(event)
  try {
    const { results } = await db.prepare(
      'SELECT * FROM vaccinations ORDER BY date DESC, id DESC'
    ).all()
    return (results ?? []) as unknown as Vaccination[]
  }
  catch {
    // Missing table (migration not applied yet) reads as "nothing logged", not a 500.
    return []
  }
})
