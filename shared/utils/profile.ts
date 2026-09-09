// Standing personal facts that get looked up, not trended — the wallet-card kind: blood type
// first (2026-09-09: it came back on a lab panel and had been forgotten). Stored as key/value
// rows in the `profile` table, so the next fact is a one-line addition here, no migration.
// Shared (app + server): the /journal/vaccines card renders these and the ask-the-data prompt
// reads them, so "what's my blood type?" has an answer in both places.

export interface ProfileField {
  key: string
  label: string
  /** 'select' renders a fixed list (no typos in a blood type); 'text' is freeform. */
  kind: 'select' | 'text'
  options?: string[]
  placeholder?: string
  hint?: string
}

// ASCII minus on purpose — it survives copy/paste, search, and the AI prompt unchanged.
export const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

export const PROFILE_FIELDS: ProfileField[] = [
  { key: 'blood_type', label: 'Blood type', kind: 'select', options: BLOOD_TYPES, hint: 'ABO + Rh' }
]

export const PROFILE_KEYS = PROFILE_FIELDS.map(f => f.key)

/** key → value, only for keys that have a stored value. */
export type Profile = Record<string, string>

export function profileLabel(key: string): string {
  return PROFILE_FIELDS.find(f => f.key === key)?.label ?? key
}
