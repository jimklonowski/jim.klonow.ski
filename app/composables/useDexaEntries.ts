// A DEXA scan as the API returns it (server/utils/db.ts parseDexaRow). Every figure is optional
// on purpose: the extraction stores only what the report printed (process-pdf's DEXA_FIELDS list,
// "leave out any figure the report doesn't have"), so an older report format, or a scan that
// skipped a region, can leave any of these out — and the save sanitizer (sanitizeDexa) keeps the
// blocks as whatever subset arrived. Readers render a missing figure as "—"; a bare `.toFixed`
// on one of these used to take the whole home page down with the row.

export interface DexaRegion {
  fat_pct?: number
  fat_lbs?: number
  lean_lbs?: number
}

export interface DexaTotal {
  body_fat_pct?: number
  total_mass_lbs?: number
  fat_mass_lbs?: number
  lean_mass_lbs?: number
  bmc_lbs?: number
  fat_free_lbs?: number
}

export interface DexaEntry {
  date: string
  weight_lbs: number
  sources: string[]
  total: DexaTotal
  regions: {
    arms?: DexaRegion
    legs?: DexaRegion
    trunk?: DexaRegion
    android?: DexaRegion
    gynoid?: DexaRegion
  }
  vat?: { volume_in3?: number, fat_mass_lbs?: number }
  ag_ratio?: number
  bone_density?: { total_bmd?: number, t_score?: number, z_score?: number }
  symmetry?: { right_arm_lean?: number, left_arm_lean?: number, right_leg_lean?: number, left_leg_lean?: number }
  /** AI body-composition summary and its provenance (migration 0006); null until generated. */
  ai_summary?: string | null
  ai_summary_model?: string | null
  ai_summary_prompt_hash?: string | null
  ai_summary_at?: string | null
}

export function useDexaEntries() {
  return useListResource<DexaEntry[]>('dexa', '/api/dexa/list', { label: 'DEXA scans' })
}
