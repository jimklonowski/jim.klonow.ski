/** A non-numeric finding (genotype, echo impression) stored alongside a draw's markers. */
export interface QualitativeResult {
  name: string
  result: string
  category?: 'echo' | 'genetic'
}

/** A lab draw as GET /api/labs/list serves it (derived markers are added client-side). */
export interface LabsEntry {
  date: string
  fasting: boolean
  sources: string[]
  markers: Record<string, number | null>
  qualitative: QualitativeResult[]
  ai_summary?: string | null
}
