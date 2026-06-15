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
    }),
    dexa: defineCollection({
      type: 'data',
      source: 'dexa/*.json',
      schema: z.object({
        date: z.string(),
        weight_lbs: z.number(),
        sources: z.array(z.string()).optional(),
        total: z.object({
          body_fat_pct: z.number(),
          total_mass_lbs: z.number(),
          fat_mass_lbs: z.number(),
          lean_mass_lbs: z.number(),
          bmc_lbs: z.number(),
          fat_free_lbs: z.number()
        }),
        regions: z.object({
          arms: z.object({ fat_pct: z.number(), fat_lbs: z.number(), lean_lbs: z.number() }),
          legs: z.object({ fat_pct: z.number(), fat_lbs: z.number(), lean_lbs: z.number() }),
          trunk: z.object({ fat_pct: z.number(), fat_lbs: z.number(), lean_lbs: z.number() }),
          android: z.object({ fat_pct: z.number(), fat_lbs: z.number() }).optional(),
          gynoid: z.object({ fat_pct: z.number(), fat_lbs: z.number() }).optional()
        }),
        vat: z.object({ volume_in3: z.number(), fat_mass_lbs: z.number() }).optional(),
        ag_ratio: z.number().optional(),
        bone_density: z.object({
          total_bmd: z.number(),
          t_score: z.number(),
          z_score: z.number()
        }).optional(),
        symmetry: z.object({
          right_arm_lean: z.number(),
          left_arm_lean: z.number(),
          right_leg_lean: z.number(),
          left_leg_lean: z.number()
        }).optional()
      })
    })
  }
})
