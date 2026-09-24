// The cron schedule, as data. nuxt.config.ts hands this to Nitro's scheduledTasks, which maps a
// firing cron to its tasks. But Cloudflare only fires the crons listed under `triggers.crons` in
// wrangler.jsonc, so the two lists have to match exactly. A cron missing from wrangler never
// runs, and one missing here fires into nothing. tests/schedule.test.mjs holds them equal and
// checks that every task name has a file under server/tasks/.
//
// No imports, and not under server/tasks/ (Nitro would treat it as a task there), so both
// nuxt.config.ts and the plain node test runner can load it.

/** Cron expression (UTC) → the Nitro tasks it runs (concurrently — Nitro starts them all at once). */
export const SCHEDULED_TASKS: Record<string, string[]> = {
  // Nightly demo-sandbox reset: discards visitor edits and re-anchors the synthetic persona's
  // relative dates so the demo always ends "yesterday" (see server/tasks/demo).
  '0 9 * * *': ['demo:reset'],
  '0 11 * * *': ['whoop:sync'],
  // Digests run after the morning Whoop sync (11:00) and Apple Health export have landed.
  '0 14 * * *': ['digest:daily'],
  // Day-of-week is always a three-letter name here. Cloudflare numbers the days 1 = Sunday … 7 =
  // Saturday, not the usual 0 = Sunday: this cron was written `* * 1` meaning Monday and has fired
  // on Sundays all along (which is the week the digests have always covered, Sun–Sat, so SUN
  // keeps it), and a `0` for Sunday is rejected outright and fails the deploy.
  '0 15 * * SUN': ['digest:weekly'],
  // Weekly D1 backup to R2 and the audit log's housekeeping, Sunday 08:00 UTC (the small hours in
  // Chicago). Nitro runs a cron's tasks in parallel, not in list order; neither depends on the other.
  '0 8 * * SUN': ['db:backup', 'audit:purge']
}

/**
 * How long after its last clean run each task counts as stale on /api/health: its cadence plus
 * a couple of hours' grace for a slow or late invocation. Every scheduled task needs an entry —
 * tests/schedule.test.mjs checks both directions.
 */
export const TASK_STALE_AFTER_HOURS: Record<string, number> = {
  'demo:reset': 26,
  'whoop:sync': 26,
  'digest:daily': 26,
  'digest:weekly': 7 * 24 + 2,
  'db:backup': 7 * 24 + 2,
  'audit:purge': 7 * 24 + 2
}
