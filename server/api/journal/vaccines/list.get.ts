import type { Vaccination } from '#shared/utils/vaccines'

// Readable by every authenticated role — an immunization record is exactly the history a
// doctor viewer wants, same policy as the supplement stack.
//
// Demo used to short-circuit to an empty list because the sandbox had neither the table nor any
// shots; it now has both (scripts/demo/generate-demo-data.mjs), so it reads the sandbox like any
// other role. `missingTableOk` below still covers a sandbox that hasn't had schema.sql applied yet.
export default defineEventHandler(async (event): Promise<Vaccination[]> => {
  requireLabsAuth(event)

  // Missing table (migration not applied yet) reads as "nothing logged", not a 500. Any other
  // error is a real failure and must not read as "no shots on record".
  const range = dateRange(event, 'date')
  return withEtag(event, await listRows(event, `SELECT * FROM vaccinations ${range.where} ORDER BY date DESC, id DESC`, row => row as unknown as Vaccination, { missingTableOk: true, binds: range.binds }))
})
