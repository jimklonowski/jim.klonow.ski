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

/** "139.2" / "140" — and "—" for a figure the scan didn't carry. */
export function formatLbs(v: number | null | undefined) {
  if (v == null) return '—'
  return v % 1 === 0 ? `${v}` : v.toFixed(1)
}

const pick = (m: DexaMetricMeta) => ({ label: m.label, unit: m.unit })

// Every figure a DEXA extraction can carry, keyed by its dotted path into the stored entry
// ('total.body_fat_pct', 'regions.arms.lean_lbs', 'symmetry.right_arm_lean'). The labels come
// from the metric tables above where one exists, so the upload preview and the DEXA page agree.
const DEXA_FIELD_META: Record<string, { label: string, unit: string }> = {
  'weight_lbs': { label: 'Scale Weight', unit: 'lbs' },
  ...Object.fromEntries(Object.entries(DEXA_TOTAL_METRICS).map(([key, m]) => [`total.${key}`, pick(m)] as const)),
  ...Object.fromEntries(Object.entries(REGION_LABELS).flatMap(([region, name]) => [
    [`regions.${region}.fat_pct`, { label: `${name} Fat %`, unit: '%' }] as const,
    [`regions.${region}.fat_lbs`, { label: `${name} Fat`, unit: 'lbs' }] as const,
    [`regions.${region}.lean_lbs`, { label: `${name} Lean`, unit: 'lbs' }] as const
  ])),
  'vat.volume_in3': pick(DEXA_OTHER_METRICS.vat_volume!),
  'vat.fat_mass_lbs': { label: 'VAT Fat Mass', unit: 'lbs' },
  'ag_ratio': { label: DEXA_OTHER_METRICS.ag_ratio!.label, unit: 'ratio' },
  'bone_density.total_bmd': pick(DEXA_OTHER_METRICS.bmd_total!),
  'bone_density.t_score': { label: DEXA_OTHER_METRICS.t_score!.label, unit: 'SD' },
  'bone_density.z_score': { label: 'BMD Z-Score', unit: 'SD' },
  'symmetry.right_arm_lean': { label: 'Right Arm Lean', unit: 'lbs' },
  'symmetry.left_arm_lean': { label: 'Left Arm Lean', unit: 'lbs' },
  'symmetry.right_leg_lean': { label: 'Right Leg Lean', unit: 'lbs' },
  'symmetry.left_leg_lean': { label: 'Left Leg Lean', unit: 'lbs' }
}

/** Label and unit for a DEXA figure by dotted path; an unknown path falls back to the path itself. */
export function dexaFieldMeta(path: string): { label: string, unit: string } {
  return DEXA_FIELD_META[path] ?? { label: path, unit: '' }
}
