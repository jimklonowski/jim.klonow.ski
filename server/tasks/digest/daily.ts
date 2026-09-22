/// <reference path="../../../worker-configuration.d.ts" />

export default defineTask({
  meta: {
    name: 'digest:daily',
    description: 'Generate the AI daily recap for yesterday and store it for in-app viewing'
  },
  async run(event): Promise<{ result: DigestResult | { error: string } }> {
    const db = ((event.context as unknown as { cloudflare: { env: Env } }).cloudflare.env).DB

    try {
      // The API key is read (and its absence reported) inside createAnthropic — see server/utils/ai.ts.
      const result = await generateDigest(db, 'daily')
      return { result }
    }
    catch (err) {
      // Swallow so the failure is visible in task logs rather than an unhandled cron error;
      // the digest can always be regenerated on demand from the panel.
      const message = err instanceof Error ? err.message : String(err)
      console.error('digest:daily failed:', message)
      return { result: { error: message } }
    }
  }
})
