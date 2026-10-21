// The health webhook's write to journal_entries, as one statement per date (audit #42 item 6).
//
// It used to SELECT the row and then INSERT or UPDATE it. Between those two statements a quick-add
// (+ SODA, + CUP, a meal) could create the same date's row, and the INSERT then failed on the
// primary key — a 500 that dropped the whole delivery, workouts and health metrics included. One
// INSERT … ON CONFLICT DO UPDATE cannot race that way, and COALESCE keeps whatever the row already
// holds: the webhook only ever fills a blank, never overwrites a reading. Kept free of Nuxt
// imports so tests/vitalsUpsert.test.mjs can run it against the real schema in node:sqlite.

export const VITAL_FIELDS = ['weight_lbs', 'rhr', 'hrv', 'bp_systolic', 'bp_diastolic'] as const
export type VitalField = typeof VITAL_FIELDS[number]
export type Vitals = Partial<Record<VitalField, number>>
export type VitalsRow = { date: string } & Record<VitalField, number | null>

export const VITALS_SELECT = ['date', ...VITAL_FIELDS].join(', ')

/** Binds `date` as ?1 and the five vitals as ?2…?6 (see `vitalsBindings`). Returns the row as written. */
export const VITALS_UPSERT_SQL = `
  INSERT INTO journal_entries (date, ${VITAL_FIELDS.join(', ')})
  VALUES (?1, ${VITAL_FIELDS.map((_, i) => `?${i + 2}`).join(', ')})
  ON CONFLICT(date) DO UPDATE SET
    ${VITAL_FIELDS.map(f => `${f} = COALESCE(journal_entries.${f}, excluded.${f})`).join(',\n    ')}
  RETURNING ${VITALS_SELECT}
`

export function vitalsBindings(date: string, vitals: Vitals): [string, ...Array<number | null>] {
  return [date, ...VITAL_FIELDS.map(f => vitals[f] ?? null)]
}

/**
 * What the upsert did to a date, for the delivery report: `before` is the row as it was (or
 * undefined when there was none), `after` the RETURNING row.
 */
export function vitalsOutcome(before: VitalsRow | undefined, after: VitalsRow | undefined): 'created' | 'updated' | 'unchanged' {
  if (!after) return 'unchanged'
  if (!before) return 'created'
  return VITAL_FIELDS.some(f => before[f] == null && after[f] != null) ? 'updated' : 'unchanged'
}
