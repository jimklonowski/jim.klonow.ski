export interface DexaRegion {
  fat_pct: number
  fat_lbs: number
  lean_lbs?: number
}

export interface DexaEntry {
  date: string
  weight_lbs: number
  sources: string[]
  total: {
    body_fat_pct: number
    total_mass_lbs: number
    fat_mass_lbs: number
    lean_mass_lbs: number
    bmc_lbs: number
    fat_free_lbs: number
  }
  regions: {
    arms: DexaRegion
    legs: DexaRegion
    trunk: DexaRegion
    android?: { fat_pct: number, fat_lbs: number }
    gynoid?: { fat_pct: number, fat_lbs: number }
  }
  vat?: { volume_in3: number, fat_mass_lbs: number }
  ag_ratio?: number
  bone_density?: { total_bmd: number, t_score: number, z_score: number }
  symmetry?: { right_arm_lean: number, left_arm_lean: number, right_leg_lean: number, left_leg_lean: number }
}

export function useDexaEntries() {
  const requestFetch = useRequestFetch()
  return useAsyncData('dexa', () => requestFetch<DexaEntry[]>('/api/dexa/list'))
}
