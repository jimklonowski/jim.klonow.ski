export default defineTask({
  meta: {
    name: 'digest:daily',
    description: 'Generate the AI daily recap for yesterday and store it for in-app viewing'
  },
  // A failure is logged to task_runs and fails the cron invocation; the digest can still be
  // regenerated on demand from the panel. The API key is read (and its absence reported)
  // inside createAnthropic — see server/utils/ai.ts.
  run: event => runLoggedTask(event, 'digest:daily', env => generateDigest(env.DB, 'daily'))
})
