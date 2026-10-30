// The bands behind TierMeter's "which band am I in" readouts (VAT volume, A/G ratio, the BMD
// T-score), and the rule that places a reading in one. Plain TS so the boundaries are tested.

export type MeterTone = 'good' | 'warn' | 'danger' | 'neutral'
export interface MeterBand {
  from: number
  to: number
  tone: MeterTone
  /**
   * The upper edge belongs to this band rather than the next. Bands are half-open by default
   * ([from, to)), which is right for "under 52 in³ is ideal", but the WHO T-score scale closes
   * the other way: −2.5 or lower is osteoporosis, so −2.5 itself had been captioned osteopenia
   * (audit #43 item 30).
   */
  inclusiveTo?: boolean
}
export interface MeterTick {
  at: number
  label: string
}

/** The band a reading falls in; past the last cutoff it belongs to the last band. */
export function bandTone(value: number | null, bands: MeterBand[]): MeterTone {
  if (value == null) return 'neutral'
  return bands.find(b => value >= b.from && (value < b.to || (b.inclusiveTo === true && value === b.to)))?.tone
    ?? (value >= (bands.at(-1)?.to ?? Infinity) ? bands.at(-1)?.tone : bands[0]?.tone)
    ?? 'neutral'
}
