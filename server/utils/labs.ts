import { BIOMARKERS } from '../../app/data/biomarkers'

// Sanitizers for anything that reaches labs_entries / dexa_entries by way of a model reading a
// PDF. A lab report is third-party content: process-pdf hands it to Claude inside the same turn
// as the extraction instructions, so a crafted PDF can steer what comes back. The owner reviews
// the preview before saving, but review is not a boundary — these are.

/**
 * Marker keys the site can actually store and display. Derived from the biomarker catalogue the
 * UI renders, minus the computed ones (Trig/HDL, HOMA-IR, remnant cholesterol, free T %), which
 * are recalculated from their inputs at read time and must never be written.
 */
export const STORABLE_MARKER_KEYS: ReadonlySet<string> = new Set(
  Object.entries(BIOMARKERS).filter(([, meta]) => !meta.computed).map(([key]) => key)
)

/** R2 object keys are stored bare and served through the authenticated proxy by exact key. */
const SAFE_PDF_NAME = /^[\w][\w .()+-]{0,120}\.pdf$/i

/**
 * Only known marker keys, only finite numbers. A value arriving as a string ("4.8") is coerced,
 * since a report's own formatting is not worth failing a whole extraction over; anything else is
 * dropped. Returns the rejected keys so the caller can say what it ignored.
 */
export function sanitizeMarkers(input: unknown): { markers: Record<string, number>, dropped: string[] } {
  const markers: Record<string, number> = {}
  const dropped: string[] = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { markers, dropped }

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!STORABLE_MARKER_KEYS.has(key)) {
      dropped.push(key)
      continue
    }
    if (raw == null) continue
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN
    if (Number.isFinite(value)) markers[key] = value
    else dropped.push(key)
  }
  return { markers, dropped }
}

/**
 * Every DEXA figure the site stores, as a dotted path into the row's JSON columns. The extraction
 * schema's enum (process-pdf) and the save sanitizer below read this one list, so a figure the
 * model can name is a figure the pages can show, and nothing else gets written.
 */
export const DEXA_FIELDS: readonly string[] = [
  'weight_lbs',
  ...['body_fat_pct', 'total_mass_lbs', 'fat_mass_lbs', 'lean_mass_lbs', 'bmc_lbs', 'fat_free_lbs'].map(f => `total.${f}`),
  ...['arms', 'legs', 'trunk'].flatMap(r => ['fat_pct', 'fat_lbs', 'lean_lbs'].map(f => `regions.${r}.${f}`)),
  ...['android', 'gynoid'].flatMap(r => ['fat_pct', 'fat_lbs'].map(f => `regions.${r}.${f}`)),
  'vat.volume_in3', 'vat.fat_mass_lbs',
  'ag_ratio',
  'bone_density.total_bmd', 'bone_density.t_score', 'bone_density.z_score',
  'symmetry.right_arm_lean', 'symmetry.left_arm_lean', 'symmetry.right_leg_lean', 'symmetry.left_leg_lean'
]
const DEXA_PATHS: ReadonlySet<string> = new Set(DEXA_FIELDS)

type Figures = Record<string, number>

export interface SanitizedDexa {
  total: Figures
  regions: Record<string, Figures>
  vat: Figures | null
  bone_density: Figures | null
  symmetry: Figures | null
  ag_ratio: number | null
  dropped: string[]
}

/**
 * The nested twin of sanitizeMarkers for a DEXA save: only the paths in DEXA_FIELDS, only finite
 * numbers (a numeric string is coerced, like a marker). Every figure is optional — the pages read
 * them that way — but a string, an object or an invented key where a number belongs would still
 * be a crash at read time, and a hand-edited JSON can carry any of those. A block with nothing
 * left in it is null (stored as NULL), not `{}`. Returns the paths it refused.
 */
export function sanitizeDexa(input: Record<string, unknown>): SanitizedDexa {
  const dropped: string[] = []
  const figure = (path: string, raw: unknown): number | null => {
    if (raw == null) return null
    if (!DEXA_PATHS.has(path)) {
      dropped.push(path)
      return null
    }
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN
    if (Number.isFinite(value)) return value
    dropped.push(path)
    return null
  }
  const block = (prefix: string, raw: unknown): Figures => {
    const out: Figures = {}
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      if (raw != null) dropped.push(prefix)
      return out
    }
    for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
      const value = figure(`${prefix}.${key}`, v)
      if (value != null) out[key] = value
    }
    return out
  }
  const orNull = (figures: Figures) => (Object.keys(figures).length ? figures : null)

  const regions: Record<string, Figures> = {}
  if (input.regions && typeof input.regions === 'object' && !Array.isArray(input.regions)) {
    for (const [region, raw] of Object.entries(input.regions as Record<string, unknown>)) {
      const figures = block(`regions.${region}`, raw)
      if (Object.keys(figures).length) regions[region] = figures
    }
  }
  else if (input.regions != null) {
    dropped.push('regions')
  }

  return {
    total: block('total', input.total),
    regions,
    vat: orNull(block('vat', input.vat)),
    bone_density: orNull(block('bone_density', input.bone_density)),
    symmetry: orNull(block('symmetry', input.symmetry)),
    ag_ratio: figure('ag_ratio', input.ag_ratio),
    dropped
  }
}

/** Bounded {name, result} pairs; anything without both as non-empty strings is discarded. */
export function sanitizeQualitative(input: unknown): Array<{ name: string, result: string }> {
  if (!Array.isArray(input)) return []
  return input
    .slice(0, 40)
    .map((q) => {
      if (!q || typeof q !== 'object') return null
      const { name, result } = q as Record<string, unknown>
      if (typeof name !== 'string' || typeof result !== 'string') return null
      const trimmed = { name: name.trim().slice(0, 120), result: result.trim().slice(0, 400) }
      return trimmed.name && trimmed.result ? trimmed : null
    })
    .filter((q): q is { name: string, result: string } => q !== null)
}

/**
 * Plain PDF object keys only — no paths, no other extensions. The PDF proxy serves any key it is
 * handed to an authenticated reader, so an attacker-supplied `sources` entry would turn a lab row
 * into a link to some other object in the bucket.
 */
/**
 * A lab PDF's object key: a flat "[Description]-[YYYY-MM-DD].pdf"-style name. Nothing else in the
 * labs bucket may leave through the PDF proxy — it also holds prefixed objects (demo/seed.json,
 * backups/d1/…), and the proxy's single path segment decodes %2F, so without this check any
 * friend or doctor session could fetch the weekly database backup by guessing its name.
 */
export function isLabPdfKey(key: string): boolean {
  return SAFE_PDF_NAME.test(key) && !key.includes('/') && !key.includes('\\')
}

export function sanitizeSources(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.filter((s): s is string => typeof s === 'string' && isLabPdfKey(s)))].slice(0, 20)
}
