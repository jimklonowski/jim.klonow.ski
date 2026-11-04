// The doctor's view of a journal day (audit #43 item 53): vitals + the dose and reconstitution
// log, nothing else. An ALLOWLIST rather than nulling named fields, so a column added later is
// private by default. Food, sodas, water and the personal notes are blanked to their empty
// shapes — the same shapes a row with nothing in them already has (parseJournalRow gives a
// null notes column as '', so the doctor's rows read exactly like a day with no note, and no
// client branch can tell "redacted" from "empty"). Pure, so tests/journalProjection.test.mjs can
// prove nothing leaks.
import type { JournalEntry } from '../types/journal'

export const DOCTOR_JOURNAL_FIELDS = ['date', 'weight_lbs', 'bp_systolic', 'bp_diastolic', 'rhr', 'hrv', 'peptides', 'reconstitutions'] as const

type DoctorField = typeof DOCTOR_JOURNAL_FIELDS[number]

export function doctorJournalEntry(entry: JournalEntry): JournalEntry {
  const kept = {} as Pick<JournalEntry, DoctorField>
  for (const field of DOCTOR_JOURNAL_FIELDS) (kept as Record<DoctorField, unknown>)[field] = entry[field]
  return { ...kept, food: {}, sodas: [], water: [], notes: '' }
}
