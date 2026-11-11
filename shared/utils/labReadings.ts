// Per-reading provenance (audit #43 item 72): what the report actually printed beside a value —
// a bound qualifier ("<10", ">1500"), the unit and reference range as printed, the issuing lab,
// the assay when the test name says one, and which PDF it came from. Stored on the draw as
// `labs_entries.readings` (migration 0021), keyed by marker like `markers`, and merged per key
// on a same-date save exactly as the values are. A bound is censored by data from here on
// (shared/utils/labNotes.ts isCensored reads the qualifier); the hand-written READING_NOTES stay
// for the explanations and for the draws saved before this existed.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.

export type Qualifier = '<' | '>'

export interface ReadingProvenance {
  /** The report printed the value with this bound: "<10" is a floor, ">1500" a ceiling. Absent = measured. */
  qualifier?: Qualifier
  /** The unit as printed, which may differ from the site's (CHW prints the differential in K/uL). */
  unit?: string
  /** The reference range as printed, either end optional. */
  ref_low?: number
  ref_high?: number
  /** The issuing laboratory: "Quest", "CHW", "Labcorp". */
  lab?: string
  /** The method, when the test name carries one: "immunoassay", "LC/MS/MS". */
  assay?: string
  /** The PDF the reading came from — one of the row's `sources` keys. */
  source?: string
}

export type Readings = Record<string, ReadingProvenance>

/** A draw with its provenance, as the list serves it. */
export interface ProvenancedDraw {
  readings?: Readings | null
}

const MAX_TEXT = 48

function text(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const t = raw.trim()
  return t ? t.slice(0, MAX_TEXT) : undefined
}

function figure(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN
  return Number.isFinite(n) ? n : undefined
}

/**
 * Only markers in `allowedKeys` (the keys being saved), only the fields above, strings bounded,
 * numbers finite, the qualifier one of the two, the source one of `sources` — a PDF the model
 * read is third-party content, and a hand-edited JSON can carry anything. An entry with nothing
 * left in it is dropped; `defaultSource` (the upload's PDF) fills a missing source.
 */
export function sanitizeReadings(input: unknown, allowedKeys: ReadonlySet<string>, sources: readonly string[], defaultSource?: string): Readings {
  const out: Readings = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!allowedKeys.has(key) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const r = raw as Record<string, unknown>
    const p: ReadingProvenance = {}
    if (r.qualifier === '<' || r.qualifier === '>') p.qualifier = r.qualifier
    const unit = text(r.unit)
    if (unit) p.unit = unit
    const low = figure(r.ref_low)
    if (low !== undefined) p.ref_low = low
    const high = figure(r.ref_high)
    if (high !== undefined) p.ref_high = high
    const lab = text(r.lab)
    if (lab) p.lab = lab
    const assay = text(r.assay)
    if (assay) p.assay = assay
    const source = typeof r.source === 'string' && sources.includes(r.source) ? r.source : defaultSource && sources.includes(defaultSource) ? defaultSource : undefined
    if (source) p.source = source
    if (Object.keys(p).length) out[key] = p
  }
  return out
}

/** This marker's provenance on the draw, or null. */
export function readingOn(draw: ProvenancedDraw | null | undefined, key: string): ReadingProvenance | null {
  return draw?.readings?.[key] ?? null
}

/** A value the report printed as a bound: the data-side half of isCensored. */
export function isBoundReading(draw: ProvenancedDraw | null | undefined, key: string): boolean {
  return readingOn(draw, key)?.qualifier != null
}

/** "<10" / ">1500" / "126" — the value with its printed qualifier. */
export function readingValueText(value: number | string, prov: ReadingProvenance | null | undefined): string {
  return `${prov?.qualifier ?? ''}${value}`
}

/** "264–916" / "<39" / ">60", or '' when the report printed no range. */
export function readingRangeText(prov: ReadingProvenance | null | undefined): string {
  if (!prov) return ''
  const { ref_low: lo, ref_high: hi } = prov
  if (lo != null && hi != null) return `${lo}–${hi}`
  if (hi != null) return `<${hi}`
  if (lo != null) return `>${lo}`
  return ''
}

/** "Quest · LC/MS/MS · printed range 264–916 ng/dL · at the instrument ceiling" — for a title or a prompt line. */
export function readingProvenanceText(prov: ReadingProvenance | null | undefined): string {
  if (!prov) return ''
  const range = readingRangeText(prov)
  return [
    prov.lab,
    prov.assay,
    range ? `printed range ${range}${prov.unit ? ` ${prov.unit}` : ''}` : prov.unit ? `printed in ${prov.unit}` : '',
    prov.qualifier === '>' ? 'at the instrument ceiling — a bound, not a measurement' : prov.qualifier === '<' ? 'below the instrument floor — a bound, not a measurement' : ''
  ].filter(Boolean).join(' · ')
}

/**
 * The lab more than half of a series' readings came from, or null while no lab has that many —
 * readings saved before provenance existed count as unknown, so one labelled draw among ten
 * unlabelled ones is not "the usual lab", it is the one worth naming. A reading from another
 * lab than the usual is the odd one out.
 */
export function usualLab(draws: ReadonlyArray<ProvenancedDraw>, key: string): string | null {
  const counts = new Map<string, number>()
  for (const d of draws) {
    const lab = readingOn(d, key)?.lab
    if (lab) counts.set(lab, (counts.get(lab) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return top && top[1] * 2 > draws.length ? top[0] : null
}
