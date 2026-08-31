export interface PeptideEntry {
  time: string
  compound: string
  dose: number
  unit: 'mg' | 'mcg' | 'iu'
  site: string
}

export interface SodaEntry {
  time: string
  drink?: string
  size?: string
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

// Standing vitamin/supplement/skin-routine stack — the regimen itself, not day-by-day dose
// logs. 'on_hand' rows are owned but not being taken; 'stopped' rows are kept as history
// (recent stops stay relevant to lab trends). Feeds the AI digest/lab-summary prompts via
// server/utils/protocol.ts.
export type SupplementCategory = 'supplement' | 'skin'
export type SupplementStatus = 'active' | 'on_hand' | 'stopped'

export interface Supplement {
  id?: number
  name: string
  dose?: string | null
  category: SupplementCategory
  status: SupplementStatus
  schedule: string
  started?: string | null
  stopped?: string | null
  notes?: string | null
  sort?: number
  created_at?: string
}

export interface JournalEntry {
  date: string
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
  sodas?: SodaEntry[]
  notes?: string
}

export const SODA_DRINKS = [
  'Dr Pepper', 'Coke', 'Diet Coke', 'Coke Zero', 'Sprite', 'Mountain Dew', 'Root Beer', 'Mr Pibb'
]

export const SODA_SIZES = [
  'Mini can', '12oz can', '20oz bottle', 'Fountain - small', 'Fountain - medium', 'Fountain - large'
]

export function blankSoda(time: string): SodaEntry {
  return { time, drink: '', size: '' }
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

export const COMPOUND_GROUPS: Record<string, string[]> = {
  'Peptides': [
    'MOTS-C', 'NAD+', 'GHK-Cu', 'KPV', 'BPC-157', 'TB-500', 'BPC-157 / TB-500',
    'Ipamorelin', 'CJC-1295', 'CJC-1295 / Ipamorelin', 'SS-31', 'Epitalon', 'Humanin',
    'Thymosin Alpha-1', 'Thymosin Beta-4', 'PT-141', 'Kisspeptin',
    'HGH', 'hCG',
    'Semaglutide', 'Tirzepatide', 'Retatrutide',
    'Semax', 'Selank', 'DSIP', 'Cerebrolysin'
  ],
  'Steroids': [
    'Testosterone Cypionate', 'Testosterone Enanthate', 'Testosterone Propionate', 'Sustanon 250',
    'Methenolone Acetate', 'Methenolone Enanthate',
    'Trenbolone Acetate', 'Trenbolone Enanthate', 'Trenbolone Hexahydrobenzylcarbonate',
    'Boldenone Undecylenate', 'Nandrolone Phenylpropionate', 'Nandrolone Decanoate',
    'Drostanolone Propionate', 'Drostanolone Enanthate', 'Dihydroboldenone Cypionate',
    'Oxandrolone', 'Methandrostenolone', 'Turinabol', 'Stanozolol',
    'Oxymetholone', 'Methasterone', 'Fluoxymesterone', 'Mesterolone'
  ],
  'PCT / Ancillaries': [
    'Clomiphene', 'Tamoxifen', 'Anastrozole', 'Enclomiphene'
  ],
  'Other': [
    'Clenbuterol', 'Finasteride', 'Dutasteride', 'Tadalafil',
    '5-Amino-1MQ', 'SLU-PP-332', 'Modafinil', 'Bromantane'
  ]
}

export interface StandingCompound {
  compound: string
  /** First day of the range (may predate the dose log — the timeline clamps it). */
  from: string
  /** Last day of the range, or null while ongoing. */
  to: string | null
  /** Dose/form note for the timeline tooltip, e.g. "7 mg gummy". */
  label: string
}

// Daily meds running since before the dose log existed — too routine to log per-day, but real
// protocol. Rendered as extra rows on the calendar's protocol timeline (not stored in D1);
// hand-maintained like the server's PROTOCOL_SCHEDULE, edit here to update.
export const STANDING_COMPOUNDS: StandingCompound[] = [
  { compound: 'Tadalafil', from: '2025-06-01', to: '2026-06-01', label: '7 mg gummy' },
  { compound: 'Tadalafil', from: '2026-06-02', to: null, label: '5 mg tablet' }
]

export interface ProtocolRule {
  compound: string
  /** Display only — adherence checks whether a dose was logged, not the amount. */
  doseLabel: string
  /** Scheduled weekdays, 0=Sun … 6=Sat. All seven = daily. */
  weekdays: number[]
  /** First date this cadence applies; adherence and calendar rings start here. */
  from: string
  /** Set when a compound leaves the schedule; keep the row for history. */
  to?: string | null
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

// The intended weekly cadence — hand-maintained like STANDING_COMPOUNDS and the server's
// PROTOCOL_SCHEDULE prose (server/utils/protocol.ts); keep the three in sync when the
// protocol changes. Drives the adherence panel on /journal/compounds and the calendar's
// scheduled-dose rings (app/utils/adherence.ts). As-needed compounds (BPC-157) deliberately
// have no rule — sporadic logging is the plan, not a lapse. `from` dates come from the dose
// log's first day of each cadence. NOTE: this describes the real protocol only; the demo
// persona's dose dates re-anchor nightly and drift across weekdays, so adherence UI is
// hidden for demo sessions.
export const PROTOCOL_RULES: ProtocolRule[] = [
  { compound: 'Testosterone Cypionate', doseLabel: '75 mg', weekdays: [1, 4], from: '2026-06-18' },
  { compound: 'hCG', doseLabel: '250 IU', weekdays: [0, 2, 5], from: '2026-06-18' },
  { compound: 'HGH', doseLabel: '2 IU', weekdays: EVERY_DAY, from: '2026-06-13' },
  { compound: 'GHK-Cu', doseLabel: '2 mg', weekdays: EVERY_DAY, from: '2026-02-01' },
  { compound: 'Finasteride', doseLabel: '1 mg', weekdays: EVERY_DAY, from: '2026-07-29' }
]

export const KNOWN_COMPOUNDS = Object.values(COMPOUND_GROUPS).flat()

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
  'Finasteride': '#059669',
  'Dutasteride': '#047857',
  'Tadalafil': '#d946ef',
  'Semaglutide': '#0891b2',
  'Tirzepatide': '#0e7490',
  'Retatrutide': '#0369a1',
  'PT-141': '#db2777',
  'Kisspeptin': '#4338ca',
  'Oxandrolone': '#c026d3',
  'Methenolone Acetate': '#9333ea',
  'Methenolone Enanthate': '#7e22ce',
  'Sustanon 250': '#e11d48',
  'Clomiphene': '#4f46e5',
  'Tamoxifen': '#0284c7',
  'Mesterolone': '#065f46',
  'Trenbolone Acetate': '#b91c1c',
  'Trenbolone Enanthate': '#991b1b',
  'Trenbolone Hexahydrobenzylcarbonate': '#7f1d1d',
  'Boldenone Undecylenate': '#15803d',
  'Nandrolone Phenylpropionate': '#be185d',
  'Nandrolone Decanoate': '#9d174d',
  'Drostanolone Propionate': '#6d28d9',
  'Drostanolone Enanthate': '#5b21b6',
  'Dihydroboldenone Cypionate': '#166534',
  'Methandrostenolone': '#d97706',
  'Turinabol': '#a16207',
  'Stanozolol': '#0ea5e9',
  'Oxymetholone': '#ea580c',
  'Methasterone': '#86198f',
  'Fluoxymesterone': '#78350f',
  'Clenbuterol': '#14b8a6',
  'Cerebrolysin': '#818cf8',
  'Bromantane': '#78716c',
  '5-Amino-1MQ': '#0d9488',
  'SLU-PP-332': '#ca8a04',
  'Humanin': '#eab308',
  'Thymosin Alpha-1': '#22c55e',
  'Thymosin Beta-4': '#f472b6'
}

export function getCompoundColor(compound: string): string {
  return COMPOUND_COLORS[compound] ?? '#6b7280'
}

export function formatSite(site: string): string {
  return INJECTION_SITE_LABELS[site] ?? site
}

// Routes that don't involve a needle. The site picker covers oral and nasal compounds too
// (finasteride, modafinil, semax), so "injection" wording has to be earned per compound
// rather than assumed — see isInjectedSite.
const NON_INJECTED_SITES = new Set(['oral', 'intranasal'])

/** Whether a logged site means the dose actually went in through a needle. */
export function isInjectedSite(site: string): boolean {
  return !!site && !NON_INJECTED_SITES.has(site)
}

/** The mirror of a bilateral site (left_glute → right_glute); unsided sites pass through. */
export function oppositeSite(site: string): string {
  if (site.startsWith('left_')) return `right_${site.slice('left_'.length)}`
  if (site.startsWith('right_')) return `left_${site.slice('right_'.length)}`
  return site
}

export function blankEntry(date: string): JournalEntry {
  return {
    date,
    weight_lbs: null,
    bp_systolic: null,
    bp_diastolic: null,
    rhr: null,
    hrv: null,
    peptides: [],
    reconstitutions: [],
    food: { breakfast: '', snack: '', lunch: '', dinner: '' },
    sodas: [],
    notes: ''
  }
}
