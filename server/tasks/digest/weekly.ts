/// <reference path="../../../worker-configuration.d.ts" />

export default defineTask({
  meta: {
    name: 'digest:weekly',
    description: 'Generate the AI weekly summary (7 days ending yesterday) and store it for in-app viewing'
  },
  async run(event): Promise<{ result: DigestResult | { error: string } }> {
    const db = ((event.context as unknown as { cloudflare: { env: Env } }).cloudflare.env).DB

    try {
      // The API key is read (and its absence reported) inside createAnthropic — see server/utils/ai.ts.
      const result = await generateDigest(db, 'weekly')
      return { result }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('digest:weekly failed:', message)
      return { result: { error: message } }
    }
  }
})
