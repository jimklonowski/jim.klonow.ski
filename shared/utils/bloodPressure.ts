// A blood-pressure reading is a PAIR (audit #42 item 25). The ask-the-data weekly line averaged
// systolic over any day that had one and diastolic over whatever was there, defaulting the
// missing side to 0 — so a week whose only cuff day lacked a diastolic read "bp 128/0" and the
// model narrated it. The daily line printed "bp 128/null" the same way. One rule for all of it:
// both figures present and above zero, or no reading. Plain TS so tests can run it.

export interface BpLike {
  bp_systolic?: number | null
  bp_diastolic?: number | null
}

export interface BpReading {
  systolic: number
  diastolic: number
}

/** The row's reading when both figures are real; null for a half-logged or zeroed pair. */
export function bpReading(row: BpLike | null | undefined): BpReading | null {
  const s = row?.bp_systolic
  const d = row?.bp_diastolic
  if (typeof s !== 'number' || typeof d !== 'number' || !(s > 0) || !(d > 0)) return null
  return { systolic: s, diastolic: d }
}

/** "128/78" for a row with a full reading, else null. */
export function bpLabel(row: BpLike | null | undefined): string | null {
  const r = bpReading(row)
  return r ? `${r.systolic}/${r.diastolic}` : null
}

/** The mean reading over the rows that have a full one, as "sys/dia" (whole numbers), else null. */
export function bpAverageLabel(rows: readonly BpLike[]): string | null {
  const readings = rows.map(bpReading).filter((r): r is BpReading => r != null)
  if (!readings.length) return null
  const mean = (pick: (r: BpReading) => number) => Math.round(readings.reduce((sum, r) => sum + pick(r), 0) / readings.length)
  return `${mean(r => r.systolic)}/${mean(r => r.diastolic)}`
}
