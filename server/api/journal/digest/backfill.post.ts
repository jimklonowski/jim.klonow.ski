import { zDigestBackfill } from '#shared/utils/schemas'

// Generates the listed missing digests one after another (each is a model call). A failure is
// reported for its date and the rest still run, so one bad day doesn't strand the batch.
// Owner-only, like generating.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  const { kind, dates } = await readValidatedJson(event, zDigestBackfill)
  const db = getDb(event)

  const results: Array<{ date: string, ok: boolean, skipped?: boolean, error?: string }> = []
  for (const date of [...new Set(dates)].sort()) {
    try {
      const r = await generateDigest(db, kind, date)
      results.push({ date, ok: true, ...(r.skipped ? { skipped: true } : {}) })
    }
    catch (err) {
      results.push({ date, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { kind, results }
})
