import type { PgxNote } from '#shared/utils/pgx'

// Every authenticated role: a drug-gene note is clinical context, the same policy as the
// protocol it annotates. The demo sandbox has the table (migration 0022) and no rows of the
// owner's — a session there reads only what it wrote itself.
export default defineEventHandler(async (event): Promise<PgxNote[]> => {
  requireLabsAuth(event)
  return withEtag(event, await listRows(event, 'SELECT * FROM pgx_notes ORDER BY id ASC', parsePgxRow, { missingTableOk: true }))
})
