// Medications on the protocol that change how a lab marker reads. A flagged marker gets an
// asterisk and an "on <compound>" badge on its card, and each affected reading in the detail
// modal is starred — but only for draws taken while the compound was on the schedule, which the
// protocol's rules already date, so pre-treatment readings stay unflagged and comparable.
// (The demo persona's labs carry none of these markers, so nothing shows in demo sessions.)
import type { ProtocolRule } from '#shared/utils/protocolRules'
import { ruleActiveOn } from '#shared/utils/protocolRules'

export interface MarkerCaveat {
  /** Protocol compound names (as logged) that skew this marker. */
  compounds: string[]
  /** Shown in the detail modal under the description, prefixed with the asterisk. */
  note: string
}

export const MARKER_CAVEATS: Record<string, MarkerCaveat> = {
  psa: {
    compounds: ['Finasteride', 'Dutasteride'],
    note: 'Starred readings were taken while on a 5-alpha-reductase inhibitor. Finasteride and dutasteride roughly halve PSA once 6–12 months in (less during the first months), so double an on-treatment value before comparing it with the untreated range or with earlier readings — and treat any rise from the on-treatment low as meaningful even while the number stays small.'
  }
}

/**
 * The caveat compound in force on `date` for this marker, or null. PSA stays suppressed for months
 * after a 5-ARI stops, so a rule's `to` date ends the flag a little early — acceptable for a badge,
 * and the note stays one click away.
 */
export function caveatCompoundOn(key: string, date: string, rules: ProtocolRule[]): string | null {
  const caveat = MARKER_CAVEATS[key]
  if (!caveat) return null
  return rules.find(r => caveat.compounds.includes(r.compound) && ruleActiveOn(r, date))?.compound ?? null
}

// --- per-reading assay notes ---

// Caveats that belong to ONE draw rather than to a medication: a different lab, a different
// assay, a value censored at the instrument ceiling. MARKER_CAVEATS cannot express these because
// it keys off which compound was on the schedule, which says nothing about how the sample was run.
// Flagged readings get a dagger instead of the caveat asterisk so the two stay tellable apart when
// both land on the same marker.
export interface ReadingNote {
  /** Draw date, YYYY-MM-DD — must match a labs_entries date exactly. */
  date: string
  /** Shown in the detail modal, prefixed with the dagger and the draw date. */
  note: string
  /**
   * The value sits at the instrument's floor or ceiling and is a bound, not a measurement: the
   * home watch tile floats it as a hollow dot off the trend line. A note without it is
   * provenance (a different assay or lab) — the value is real, just not comparable with its
   * neighbours, so it keeps its place on the line and carries only the dagger.
   */
  censored?: boolean
}

// The labs summary prompt reads these too (server/api/labs/generate-summary.post.ts daggers the
// value in the marker history and prints the note), so write each one for the model as much as
// for the modal: say what the value is, what it may be compared with, and what it may not.
export const READING_NOTES: Record<string, ReadingNote[]> = {
  testosterone_total: [
    {
      date: '2026-09-09',
      censored: true,
      note: 'Run on the CHW panel, which measures total testosterone by immunoassay rather than LC/MS-MS and reports only as high as 1500 ng/dL. The result came back flagged high at exactly 1500, so read it as "at least 1500" — a censored ceiling, not a measurement. The true value is unknown and may sit well above it; the LC/MS-MS draw three weeks earlier was 2211. That panel also carried its own 264-916 ng/dL reference range rather than the 250-1100 stored here, so the flag understates how far out of range the reading is. Treat this point as a floor and leave it out when judging the trend.'
    }
  ],
  // Two estradiol assays exist on the same sample whenever the Whoop Advanced Labs panel (standard
  // immunoassay) is paired with the Jason Health ultrasensitive LC/MS/MS add-on, and the value on
  // file is whichever report was uploaded last (save-json merges per key, last upload wins).
  estradiol: [
    {
      date: '2026-08-15',
      note: 'Ultrasensitive LC/MS/MS estradiol (Quest order code 30289) from a separate same-day add-on. The Whoop Advanced Labs panel drawn from the same sample ran the standard immunoassay and read 85; the add-on was uploaded last, so this is the value on file. Compare it only with other ultrasensitive readings.'
    },
    {
      date: '2026-10-17',
      note: 'Two estradiol assays were run on this sample: the Whoop Advanced Labs panel\'s standard immunoassay (157) and a separate ultrasensitive LC/MS/MS add-on (126). The value on file is whichever report was uploaded last. The ultrasensitive 126 is the one to trend — against the ultrasensitive 106 of 2026-08-15 it is a rise of about 20% — and the immunoassay 157 must never be set against the LC/MS/MS series. If 157 is the value shown, the add-on report has not been uploaded yet and any change computed from it is cross-assay; say so rather than quantify it.'
    }
  ]
}

/** The note attached to this marker on `date`, or null. */
export function readingNoteOn(key: string, date: string): ReadingNote | null {
  return READING_NOTES[key]?.find(n => n.date === date) ?? null
}
