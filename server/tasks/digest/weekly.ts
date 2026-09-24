export default defineTask({
  meta: {
    name: 'digest:weekly',
    description: 'Generate the AI weekly summary (7 days ending yesterday) and store it for in-app viewing'
  },
  // Same contract as digest:daily — logged, and a failure fails the cron invocation.
  run: event => runLoggedTask(event, 'digest:weekly', env => generateDigest(env.DB, 'weekly'))
})
