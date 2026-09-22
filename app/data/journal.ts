import type { JournalEntry, SodaEntry, Vial } from '#shared/types/journal'

// The row shapes live in shared/types/journal.ts (the server reads the same rows); re-exported
// so the pages' existing `~/data/journal` imports keep working.
export type {
  DoseUnit, JournalEntry, PeptideEntry, ReconstitutionEntry, SodaEntry, Supplement,
  SupplementCategory, SupplementStatus, Vial, VialStatus
} from '#shared/types/journal'

export function blankVial(compound = ''): Vial {
  return {
    compound,
    supplier: '',
    vial_amount: 10,
    vial_unit: 'mg',
    form: 'vial',
    unit_count: null,
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

export const SODA_DRINKS = [
  'Dr Pepper', 'Coke', 'Cherry Coke', 'Diet Coke', 'Coke Zero', 'Sprite', 'Mountain Dew', 'Root Beer', 'Mr Pibb',
  'Orange Fanta', 'Orange Crush'
]

// Sizes are stored as freeform strings on each soda entry, so renaming one here means migrating
// the rows that already hold the old spelling (see server/database/migrate-soda-mini-can-2026-09-16.sql).
export const SODA_SIZES = [
  '7.5oz mini can', '12oz can', '20oz bottle', 'Fountain - small', 'Fountain - medium', 'Fountain - large'
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

// `as const` so KnownCompound below is the literal union of every name, which is what makes
// COMPOUND_COLORS exhaustive at compile time — HGH, the daily core compound, sat without a colour
// for months and rendered grey on every timeline because nothing checked.
export const COMPOUND_GROUPS = {
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
    '5-Amino-1MQ', 'SLU-PP-332', 'Modafinil', 'Bromantane',
    'Iron Bisglycinate'
  ]
} as const satisfies Record<string, readonly string[]>

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
// hand-maintained like the server's PROTOCOL_SCHEDULE prose and the PROTOCOL_RULES cadence
// (shared/utils/protocolRules.ts — shared so the digest prompts score against the same
// weekdays as the adherence panel), edit here to update.
export const STANDING_COMPOUNDS: StandingCompound[] = [
  { compound: 'Tadalafil', from: '2025-06-01', to: '2026-06-01', label: '7 mg gummy' },
  { compound: 'Tadalafil', from: '2026-06-02', to: null, label: '5 mg tablet' }
]

/** Every name in COMPOUND_GROUPS, as a union — the key set COMPOUND_COLORS must cover. */
export type KnownCompound = (typeof COMPOUND_GROUPS)[keyof typeof COMPOUND_GROUPS][number]

export const KNOWN_COMPOUNDS: string[] = Object.values(COMPOUND_GROUPS).flat()

/**
 * Timeline/dot colour per compound. The `satisfies` is load-bearing: adding a name to
 * COMPOUND_GROUPS without a colour here is now a typecheck failure rather than a silently grey
 * row. Freeform compounds that aren't in the list fall back in getCompoundColor().
 *
 * The three testosterone esters deliberately share one red — same hormone, different ester.
 */
export const COMPOUND_COLORS = {
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
  // Core protocol beside testosterone and hCG: a bright cyan so the daily HGH row is
  // unmistakable against the red and amber of the other two.
  'HGH': '#67e8f9',
  'hCG': '#b45309',
  'Anastrozole': '#6366f1',
  'Enclomiphene': '#7c3aed',
  'Finasteride': '#059669',
  'Dutasteride': '#047857',
  'Tadalafil': '#d946ef',
  'Iron Bisglycinate': '#92400e',
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
  // Nootropics and sleep, kept to one indigo→slate family so the group reads as a group on a
  // timeline; Modafinil takes the bright yellow since it's the stimulant among them.
  'Cerebrolysin': '#818cf8',
  'Semax': '#a5b4fc',
  'Selank': '#c7d2fe',
  'DSIP': '#94a3b8',
  'Bromantane': '#78716c',
  'Modafinil': '#fde047',
  '5-Amino-1MQ': '#0d9488',
  'SLU-PP-332': '#ca8a04',
  'Humanin': '#eab308',
  'Thymosin Alpha-1': '#22c55e',
  'Thymosin Beta-4': '#f472b6'
} as const satisfies Record<KnownCompound, string>

/** Neutral grey for a freeform compound that isn't one of the known names. */
export const UNKNOWN_COMPOUND_COLOR = '#6b7280'

export function getCompoundColor(compound: string): string {
  // Cast because the map is keyed by the known union, while callers pass logged text that may
  // be anything the day form accepted.
  return (COMPOUND_COLORS as Record<string, string>)[compound] ?? UNKNOWN_COMPOUND_COLOR
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
