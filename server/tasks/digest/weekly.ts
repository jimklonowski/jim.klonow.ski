/// <reference path="../../../worker-configuration.d.ts" />

export default defineTask({
  meta: {
    name: 'digest:weekly',
    description: 'Generate the AI weekly summary (7 days ending yesterday) and store it for in-app viewing'
  },
  async run(event) {
    const db = ((event.context as unknown as { cloudflare: { env: Env } }).cloudflare.env).DB
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { result: { error: 'ANTHROPIC_API_KEY not configured' } }

    try {
      const result = await generateDigest(db, apiKey, 'weekly')
      return { result }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('digest:weekly failed:', message)
      return { result: { error: message } }
    }
  }
})
