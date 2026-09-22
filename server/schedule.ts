// The cron schedule, as data. nuxt.config.ts hands this to Nitro's scheduledTasks, which maps a
// firing cron to its tasks. But Cloudflare only fires the crons listed under `triggers.crons` in
// wrangler.jsonc, so the two lists have to match exactly. A cron missing from wrangler never
// runs, and one missing here fires into nothing. tests/schedule.test.mjs holds them equal and
// checks that every task name has a file under server/tasks/.
//
// No imports, and not under server/tasks/ (Nitro would treat it as a task there), so both
// nuxt.config.ts and the plain node test runner can load it.

/** Cron expression (UTC) → the Nitro tasks it runs, in order. */
export const SCHEDULED_TASKS: Record<string, string[]> = {
  // Nightly demo-sandbox reset: discards visitor edits and re-anchors the synthetic persona's
  // relative dates so the demo always ends "yesterday" (see server/tasks/demo).
  '0 9 * * *': ['demo:reset'],
  '0 11 * * *': ['whoop:sync'],
  // Digests run after the morning Whoop sync (11:00) and Apple Health export have landed.
  '0 14 * * *': ['digest:daily'],
  '0 15 * * 1': ['digest:weekly']
}
