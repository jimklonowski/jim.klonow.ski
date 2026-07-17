/// <reference path="../../../worker-configuration.d.ts" />

export default defineTask({
  meta: {
    name: 'digest:daily',
    description: 'Generate the AI daily recap for yesterday and store it for in-app viewing'
  },
  async run(event) {
    const db = ((event.context as unknown as { cloudflare: { env: Env } }).cloudflare.env).DB
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { result: { error: 'ANTHROPIC_API_KEY not configured' } }

    const result = await generateDigest(db, apiKey, 'daily')
    return { result }
  }
})
