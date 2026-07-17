export interface PeptideEntry {
  time: string
  compound: string
  dose: number
  unit: 'mg' | 'mcg' | 'iu'
  site: string
}

export interface ReconstitutionEntry {
  compound: string
  vial_amount: number
  vial_unit: 'mg' | 'mcg' | 'iu'
  supplier?: string
  bac_water_ml: number
}

export type VialStatus = 'sealed' | 'active' | 'finished'

export interface Vial {
  id?: number
  compound: string
  supplier?: string | null
  vial_amount: number
  vial_unit: 'mg' | 'mcg' | 'iu'
  quantity: number
  status: VialStatus
  opened_date?: string | null
  bac_water_ml?: number | null
  lot?: string | null
  expiry?: string | null
  cost?: number | null
  notes?: string | null
  created_at?: string
}

export const VIAL_STATUS_LABELS: Record<VialStatus, string> = {
  sealed: 'Sealed',
  active: 'Active',
  finished: 'Finished'
}

export function blankVial(compound = ''): Vial {
  return {
    compound,
    supplier: '',
    vial_amount: 10,
    vial_unit: 'mg',
    quantity: 1,
    status: 'sealed',
    opened_date: null,
    bac_water_ml: null,
    lot: '',
    expiry: '',
    cost: null,
    notes: ''
  }
}

export interface JournalEntry {
  date: string
  day?: number | null
  weight_lbs?: number | null
  bp_systolic?: number | null
  bp_diastolic?: number | null
  rhr?: number | null
  hrv?: number | null
  peptides?: PeptideEntry[]
  reconstitutions?: ReconstitutionEntry[]
  food?: {
    breakfast?: string
    snack?: string
    lunch?: string
    dinner?: string
  }
  notes?: string
}

export const INJECTION_SITES = [
  { label: 'Left Glute', value: 'left_glute' },
  { label: 'Right Glute', value: 'right_glute' },
  { label: 'Left Delt', value: 'left_delt' },
  { label: 'Right Delt', value: 'right_delt' },
  { label: 'Left Quad', value: 'left_quad' },
  { label: 'Right Quad', value: 'right_quad' },
  { label: 'Abdomen', value: 'abdomen' },
  { label: 'Left Love Handle', value: 'left_love_handle' },
  { label: 'Right Love Handle', value: 'right_love_handle' },
  { label: 'Left of Navel', value: 'left_navel' },
  { label: 'Right of Navel', value: 'right_navel' },
  { label: 'Oral', value: 'oral' },
  { label: 'Intranasal', value: 'intranasal' },
  { label: 'Other', value: 'other' }
]

export const INJECTION_SITE_LABELS: Record<string, string> = {
  left_glute: 'Left Glute',
  right_glute: 'Right Glute',
  left_delt: 'Left Delt',
  right_delt: 'Right Delt',
  left_quad: 'Left Quad',
  right_quad: 'Right Quad',
  abdomen: 'Abdomen',
  left_love_handle: 'Left Love Handle',
  right_love_handle: 'Right Love Handle',
  left_navel: 'Left of Navel',
  right_navel: 'Right of Navel',
  oral: 'Oral',
  intranasal: 'Intranasal',
  other: 'Other'
}

export const DOSE_UNITS = [
  { label: 'mg', value: 'mg' },
  { label: 'mcg', value: 'mcg' },
  { label: 'IU', value: 'iu' }
]

export const KNOWN_COMPOUNDS = [
  // Peptides
  'MOTS-C', 'NAD+', 'GHK-Cu', 'KPV', 'BPC-157', 'TB-500', 'BPC-157 / TB-500',
  'Ipamorelin', 'CJC-1295', 'CJC-1295 / Ipamorelin', 'SS-31', 'Epitalon', 'Humanin',
  'Thymosin Alpha-1', 'Thymosin Beta-4', 'PT-141', 'Kisspeptin',
  // TRT / Hormones
  'Testosterone Cypionate', 'Testosterone Enanthate', 'Testosterone Propionate',
  'HGH', 'hCG', 'Anastrozole', 'Enclomiphene',
  // Anabolic Steroids
  'Oxandrolone',
  // GLP-1
  'Semaglutide', 'Tirzepatide',
  // Metabolic / Research Compounds
  '5-Amino-1MQ', 'SLU-PP-332',
  // Nootropics
  'Modafinil', 'Semax', 'Selank', 'DSIP'
]

export const COMPOUND_COLORS: Record<string, string> = {
  'MOTS-C': '#3b82f6',
  'NAD+': '#8b5cf6',
  'GHK-Cu': '#f59e0b',
  'KPV': '#10b981',
  'BPC-157': '#ef4444',
  'TB-500': '#ec4899',
  'BPC-157 / TB-500': '#f43f5e',
  'Ipamorelin': '#06b6d4',
  'CJC-1295': '#84cc16',
  'CJC-1295 / Ipamorelin': '#65a30d',
  'SS-31': '#f97316',
  'Epitalon': '#a855f7',
  'Testosterone Cypionate': '#dc2626',
  'Testosterone Enanthate': '#dc2626',
  'Testosterone Propionate': '#dc2626',
  'hCG': '#b45309',
  'Anastrozole': '#6366f1',
  'Enclomiphene': '#7c3aed',
  'Semaglutide': '#0891b2',
  'Tirzepatide': '#0e7490',
  'PT-141': '#db2777',
  'Kisspeptin': '#4338ca',
  'Oxandrolone': '#c026d3',
  '5-Amino-1MQ': '#0d9488',
  'SLU-PP-332': '#ca8a04'
}

export function getCompoundColor(compound: string): string {
  return COMPOUND_COLORS[compound] ?? '#6b7280'
}

export function formatSite(site: string): string {
  return INJECTION_SITE_LABELS[site] ?? site
}

export function blankEntry(date: string): JournalEntry {
  return {
    date,
    day: null,
    weight_lbs: null,
    bp_systolic: null,
    bp_diastolic: null,
    rhr: null,
    hrv: null,
    peptides: [],
    reconstitutions: [],
    food: { breakfast: '', snack: '', lunch: '', dinner: '' },
    notes: ''
  }
}
