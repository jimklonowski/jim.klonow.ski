import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    labs: defineCollection({
      type: 'data',
      source: 'labs/*.json',
      schema: z.object({
        date: z.string(),
        fasting: z.boolean(),
        sources: z.array(z.string()).optional(),
        markers: z.record(z.string(), z.number().nullable())
      })
    })
  }
})
