import type { Phlebotomy } from '#shared/utils/hematocrit'

// Every authenticated role: a phlebotomy is clinical history the doctor view wants beside the
// CBC. The demo sandbox has the table (migration 0017), empty unless a demo session logs one.
export default defineEventHandler(async (event): Promise<Phlebotomy[]> => {
  requireLabsAuth(event)
  const range = dateRange(event, 'date')
  return withEtag(event, await listRows(event, `SELECT * FROM phlebotomies ${range.where} ORDER BY date DESC, id DESC`, row => row as unknown as Phlebotomy, { missingTableOk: true, binds: range.binds }))
})
