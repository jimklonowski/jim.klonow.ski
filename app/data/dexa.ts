export interface DexaMetricMeta {
  label: string
  unit: string
  description: string
  refMin?: number
  refMax?: number
  lowerIsBetter?: boolean
}

export const DEXA_TOTAL_METRICS: Record<string, DexaMetricMeta> = {
  body_fat_pct: {
    label: 'Body Fat %',
    unit: '%',
    lowerIsBetter: true,
    description: 'Total body fat as a percentage of total mass. For athletic men, 10–20% is considered fit; below 10% is athlete range.'
  },
  lean_mass_lbs: {
    label: 'Lean Mass',
    unit: 'lbs',
    description: 'Muscle mass, organs, blood, and stomach contents. The primary driver of metabolic rate and physical strength.'
  },
  fat_mass_lbs: {
    label: 'Fat Mass',
    unit: 'lbs',
    lowerIsBetter: true,
    description: 'Total fat tissue in the body including essential fat (brain, bone marrow) and storage fat.'
  },
  total_mass_lbs: {
    label: 'Total Mass (DEXA)',
    unit: 'lbs',
    description: 'DEXA-measured total body mass (Fat + Lean + BMC). May differ slightly from scale weight due to scan methodology.'
  },
  fat_free_lbs: {
    label: 'Fat-Free Mass',
    unit: 'lbs',
    description: 'Total of lean tissue and bone mineral content. Equivalent to lean body mass.'
  },
  bmc_lbs: {
    label: 'Bone Mineral Content',
    unit: 'lbs',
    description: 'Total bone mineral content — typically 3–5% of total body mass. Increases with resistance training and adequate calcium/vitamin D.'
  }
}

export const DEXA_OTHER_METRICS: Record<string, DexaMetricMeta> = {
  ag_ratio: {
    label: 'A/G Ratio',
    unit: '',
    refMax: 1.0,
    lowerIsBetter: true,
    description: 'Android-to-Gynoid fat ratio. Android fat (abdomen) vs gynoid fat (hips). Below 1.0 is optimal — indicates fat is distributed away from the abdomen.'
  },
  vat_volume: {
    label: 'VAT Volume',
    unit: 'in³',
    refMax: 52,
    lowerIsBetter: true,
    description: 'Visceral Adipose Tissue volume in the abdominal cavity. VAT is metabolically active fat strongly linked to insulin resistance, metabolic syndrome, and cardiovascular disease. Below 52 in³ is ideal.'
  },
  bmd_total: {
    label: 'Bone Mineral Density',
    unit: 'g/cm²',
    description: 'Total body bone mineral density. T-score above -1.0 is normal; -1.0 to -2.5 is osteopenia; below -2.5 is osteoporosis.'
  },
  t_score: {
    label: 'BMD T-Score',
    unit: '',
    refMin: -1.0,
    description: 'Bone density compared to a healthy 30-year-old reference. Above -1.0 is normal; -1.0 to -2.5 is osteopenia.'
  }
}

export const REGION_LABELS: Record<string, string> = {
  arms: 'Arms',
  legs: 'Legs',
  trunk: 'Trunk',
  android: 'Android (Abdomen)',
  gynoid: 'Gynoid (Hips)'
}

export function formatLbs(v: number) {
  return v % 1 === 0 ? `${v}` : v.toFixed(1)
}
