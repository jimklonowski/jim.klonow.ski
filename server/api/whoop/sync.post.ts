export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  // A cron-fired scheduled() invocation hands the task its own { cloudflare } context automatically;
  // calling runTask manually from a request handler must forward this event's context explicitly
  // so the task's event.context.cloudflare.env (D1 binding) is populated the same way.
  return runTask('whoop:sync', { payload: {}, context: { cloudflare: event.context.cloudflare } })
})
