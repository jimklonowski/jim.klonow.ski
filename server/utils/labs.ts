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
