/// <reference path="../../../worker-configuration.d.ts" />
import { localDaysAgo } from '#shared/utils/time'

// Nightly wipe + reseed of the demo sandbox (DEMO_DB) from the seed stored in R2
// (demo/seed.json in LABS_BUCKET, uploaded by `pnpm demo:seed:remote`). Two jobs in one:
// discard whatever demo visitors wrote yesterday, and re-anchor every relative date so the
// persona's data always ends "yesterday" — streaks, LOGGED TODAY, and digest recency stay
// alive without the seed ever going stale.
//
// The seed lives in R2 instead of the bundle so ~180 KB of fixture JSON doesn't ride along
// in the Worker bundle. Bindings come straight off the env — never
// getDb(), which is role-routed and has no auth context in a cron anyway.
//
// The @D<n> materialization below mirrors scripts/demo/seed-demo.mjs — keep the two in sync.

interface SeedTable {
  cols: string[]
  jsonCols: string[]
  rows: unknown[][]
}

interface SeedFile {
  version: number
  tables: Record<string, SeedTable>
}

const SEED_KEY = 'demo/seed.json'
const OFFSET_RE = /^@D(-?\d+)(.*)$/

type ResetResult = { error: string } | { tables: number, rows: number }

// "@D<n>rest" -> (yesterday - n days) + rest, in the app's home timezone. Negative offsets
// look forward (vial expiries).
function materialize(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const m = OFFSET_RE.exec(value)
  return m ? localDaysAgo(Number(m[1]) + 1) + m[2] : value
}

export default defineTask({
  meta: {
    name: 'demo:reset',
    description: 'Wipe the demo sandbox DB and reseed it from R2 with dates re-anchored to yesterday'
  },
  async run(event): Promise<{ result: ResetResult }> {
    const env = (event.context as unknown as { cloudflare: { env: Env } }).cloudflare.env
    const db = env.DEMO_DB
    const bucket = env.LABS_BUCKET

    // Fetch + parse BEFORE wiping anything: an R2 hiccup must never leave the demo empty.
    // A failure between the wipe and the inserts self-heals on the next nightly run.
    const object = await bucket.get(SEED_KEY)
    if (!object) {
      console.error(`demo:reset skipped: ${SEED_KEY} not found in LABS_BUCKET — run pnpm demo:seed:remote`)
      return { result: { error: 'seed not found' } }
    }
    const seed = await object.json<SeedFile>()

    // Check every table and column the seed needs BEFORE deleting anything. The failure this
    // guards against is a real one: a seed written after a schema change lands on a sandbox that
    // never got the matching ALTER, the DELETE succeeds, the INSERT throws on the unknown
    // column, and the table sits empty until someone notices. Checking first turns that into a
    // no-op with a message naming the column.
    const problems: string[] = []
    for (const [name, table] of Object.entries(seed.tables)) {
      const info = await db.prepare(`PRAGMA table_info(${name})`).all<{ name: string }>()
      const columns = new Set((info.results ?? []).map(c => c.name))
      if (!columns.size) {
        problems.push(`${name}: table missing`)
        continue
      }
      const missing = table.cols.filter(c => !columns.has(c))
      if (missing.length) problems.push(`${name}: no column ${missing.join(', ')}`)
    }
    if (problems.length) {
      const error = `demo schema is behind the seed — ${problems.join('; ')}. Run pnpm db:migrate:remote.`
      console.error(`demo:reset skipped: ${error}`)
      return { result: { error } }
    }

    let total = 0
    for (const [name, table] of Object.entries(seed.tables)) {
      const jsonCols = new Set(table.jsonCols.map(c => table.cols.indexOf(c)))
      const rows = table.rows.map(row => row.map((v, i) => (jsonCols.has(i) ? JSON.stringify(v) : materialize(v))))

      // Multi-row inserts, sized under D1's ~100 bound-params-per-statement cap.
      const perStatement = Math.max(1, Math.floor(90 / table.cols.length))
      const statements: D1PreparedStatement[] = []
      for (let i = 0; i < rows.length; i += perStatement) {
        const chunk = rows.slice(i, i + perStatement)
        const placeholders = chunk.map(r => `(${r.map(() => '?').join(',')})`).join(',')
        statements.push(
          db.prepare(`INSERT INTO ${name} (${table.cols.join(',')}) VALUES ${placeholders}`).bind(...chunk.flat())
        )
      }

      // The DELETE rides in the same batch as the first inserts, and a D1 batch is one
      // transaction — so if the very first insert fails the wipe rolls back with it rather than
      // leaving the table empty. Later chunks are batched in groups so one oversized batch can't
      // blow the request limits; a failure there still self-heals on the next nightly run.
      await db.batch([db.prepare(`DELETE FROM ${name}`), ...statements.slice(0, 20)])
      for (let i = 20; i < statements.length; i += 20) {
        await db.batch(statements.slice(i, i + 20))
      }
      total += rows.length
    }

    return { result: { tables: Object.keys(seed.tables).length, rows: total } }
  }
})
