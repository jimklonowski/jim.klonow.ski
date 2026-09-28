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
  /** Provenance of ai_summary: the model, a hash of its exact prompt, and when (null before 0004). */
  ai_summary_model?: string | null
  ai_summary_prompt_hash?: string | null
  ai_summary_at?: string | null
}
