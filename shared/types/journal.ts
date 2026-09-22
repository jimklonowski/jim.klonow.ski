// Journal-side row shapes, declared once for the app and the server. Before this, the dose,
// soda, and day-row shapes each had a private copy in the digest builder, the /ask fact sheet,
// and the trend engine (five `JournalRow`-ish interfaces in all), and `'mg' | 'mcg' | 'iu'` was
// spelled out in four places.
//
// The per-item shapes inside a day (a dose, a soda, a reconstitution) are DERIVED from the zod
// schemas that validate the save, so what the API accepts and what the pages read can't drift.
// The row shapes stay hand-written: reads include rows written before a field existed, so they
// are looser (optional, nullable) than what a save produces today.
import type { z } from 'zod'
import type { VialForm } from '../utils/vialForm'
import type { zPeptideEntry, zReconstitutionEntry, zSodaEntry } from '../utils/schemas'

/** Every unit a dose or a vial is logged in, stored lowercase. */
export const DOSE_UNIT_VALUES = ['mg', 'mcg', 'iu'] as const
export type DoseUnit = typeof DOSE_UNIT_VALUES[number]

// --- inside a journal day (the JSON columns) ---

export type PeptideEntry = z.output<typeof zPeptideEntry>
export type SodaEntry = z.output<typeof zSodaEntry>
export type ReconstitutionEntry = z.output<typeof zReconstitutionEntry>

// --- journal_entries ---

/** A journal day as the pages hold it. Everything but the date may be absent on older rows. */
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

/**
 * A journal_entries row as the server's prompt builders read it: JSON columns decoded to
 * arrays, SQL NULLs kept as null, and nothing absent. Food and reconstitutions are left out —
 * no prompt reads them.
 */
export interface JournalRow extends Pick<
  Required<JournalEntry>, 'date' | 'weight_lbs' | 'bp_systolic' | 'bp_diastolic' | 'rhr' | 'hrv' | 'peptides' | 'sodas'
> {
  notes: string | null
}

// --- vials ---

export type VialStatus = 'sealed' | 'active' | 'finished'

export interface Vial {
  id?: number
  compound: string
  supplier?: string | null
  /** Total content of ONE container — a pill bottle's unit_count × strength, never the per-pill dose. */
  vial_amount: number
  vial_unit: DoseUnit
  /** vial (powder/oil/pen) or a pill bottle (tablet/capsule); see shared/utils/vialForm.ts. */
  form: VialForm
  /** Tablets/capsules per bottle; null for vials. */
  unit_count?: number | null
  /** Identical containers on hand (sealed batches); always 1 once opened. */
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

/** One inventory row the stockpile parser (POST /api/journal/vials/parse) proposes. */
export interface ParsedVial {
  compound: string
  /** vial (powder, oil, pen) or a pill bottle (tablet | capsule). */
  form: VialForm
  /** Total content of one container — for a bottle, unit_count × per-pill strength. */
  vial_amount: number
  vial_unit: DoseUnit
  /** Pills per bottle for tablet/capsule rows; null otherwise. */
  unit_count: number | null
  quantity: number
  notes: string
  assumption: string
}

// --- supplements ---
// The standing vitamin/supplement/skin-routine stack: the regimen itself, not day-by-day dose
// logs. 'on_hand' rows are owned but not being taken. 'stopped' rows are kept as history, since
// recent stops stay relevant to lab trends. The stack feeds the AI prompts via server/utils/protocol.ts.

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

// --- health_metrics / workouts ---

export interface HealthMetricsEntry {
  date: string
  vo2_max: number | null
  body_fat_pct: number | null
  lean_body_mass_lbs: number | null
  sleep_total_min: number | null
  sleep_rem_min: number | null
  sleep_deep_min: number | null
  sleep_core_min: number | null
  sleep_awake_min: number | null
  recovery_score: number | null
  strain: number | null
  sleep_performance_pct: number | null
}

export interface WorkoutEntry {
  id: number
  external_id: string | null
  date: string
  workout_type: string | null
  start_time: string | null
  duration_min: number | null
  calories: number | null
  avg_hr: number | null
  max_hr: number | null
  distance_mi: number | null
  /** Which trackers recorded this session (e.g. ['apple', 'whoop']) — merged server-side. */
  sources: string[]
}
