import type { MarkerCaveat, ReadingNote } from '#shared/utils/labNotes'

// Medications on the protocol that change how a lab marker reads, and the caveats that belong
// to one draw (shared/utils/labNotes.ts has the shapes and the pure helpers). A flagged marker
// gets an asterisk and an "on <compound>" badge on its card, and each affected reading in the
// detail modal is starred — but only for draws taken while the compound was on the schedule,
// which the protocol's rules already date, so pre-treatment readings stay unflagged and
// comparable. (The demo persona's labs carry none of these markers, and a demo session is sent
// none of this anyway.)
//
// Server-side on purpose (audit #43 item 48): the reading notes quote the owner's actual values
// and the caveats name the medications, and anything a page imports ends up in a public chunk.
// The client receives the caveats through /api/labs/notes and each draw's notes on the draw
// itself (/api/labs/list, readingNotesOn).

// Isotretinoin (Accutane, from Nov 2026 for truncal acne) moves the lipid panel and the liver
// enzymes — the very markers the Primobolan decision is gated on — so each of those cards says
// the reading was taken on it. One note per marker; the compound list is shared.
const ISOTRETINOIN = ['Isotretinoin']
const ISOTRETINOIN_LIPID_NOTE = 'Starred readings were taken while on isotretinoin, which raises triglycerides (in roughly a quarter to half of patients) and LDL and lowers HDL, mostly inside the first 4–8 weeks of a course and reversibly after it ends. Read an on-treatment lipid against the pre-course baseline as a drug effect first, not as diet or as the anabolic question — and do not treat it as the baseline that gates an oral anabolic.'
const ISOTRETINOIN_LIVER_NOTE = 'Starred readings were taken while on isotretinoin, which raises ALT and AST mildly in a minority of patients, dose-dependently and reversibly. A rise during the course is expected drug effect to monitor rather than new liver injury to investigate, unless it climbs past about three times the upper limit; and it is not a clean liver baseline for an oral anabolic.'

export const MARKER_CAVEATS: Record<string, MarkerCaveat> = {
  psa: {
    compounds: ['Finasteride', 'Dutasteride'],
    note: 'Starred readings were taken while on a 5-alpha-reductase inhibitor. Finasteride and dutasteride roughly halve PSA once 6–12 months in (less during the first months), so double an on-treatment value before comparing it with the untreated range or with earlier readings — and treat any rise from the on-treatment low as meaningful even while the number stays small.'
  },
  triglycerides: { compounds: ISOTRETINOIN, note: ISOTRETINOIN_LIPID_NOTE },
  ldl: { compounds: ISOTRETINOIN, note: ISOTRETINOIN_LIPID_NOTE },
  hdl: { compounds: ISOTRETINOIN, note: ISOTRETINOIN_LIPID_NOTE },
  cholesterol: { compounds: ISOTRETINOIN, note: ISOTRETINOIN_LIPID_NOTE },
  non_hdl: { compounds: ISOTRETINOIN, note: ISOTRETINOIN_LIPID_NOTE },
  alt: { compounds: ISOTRETINOIN, note: ISOTRETINOIN_LIVER_NOTE },
  ast: { compounds: ISOTRETINOIN, note: ISOTRETINOIN_LIVER_NOTE }
}

// --- per-reading assay notes ---

// Caveats that belong to ONE draw rather than to a medication: a different lab, a different
// assay, a value censored at the instrument ceiling. MARKER_CAVEATS cannot express these because
// it keys off which compound was on the schedule, which says nothing about how the sample was run.
// Flagged readings get a dagger instead of the caveat asterisk so the two stay tellable apart when
// both land on the same marker. The `date` must match a labs_entries date exactly.
//
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
export function readingNoteFor(key: string, date: string): ReadingNote | null {
  return READING_NOTES[key]?.find(n => n.date === date) ?? null
}

/** Every marker's note on the draw of `date`, keyed by marker — what rides on the draw in
 * /api/labs/list; undefined when the draw has none, so a clean draw's JSON stays as it was. */
export function readingNotesOn(date: string): Record<string, ReadingNote> | undefined {
  let out: Record<string, ReadingNote> | undefined
  for (const [key, notes] of Object.entries(READING_NOTES)) {
    const note = notes.find(n => n.date === date)
    if (note) (out ??= {})[key] = note
  }
  return out
}

/** A bound at the instrument's limit on `date` (see isCensored in shared/utils/labNotes.ts). */
export function isCensoredOn(key: string, date: string): boolean {
  return readingNoteFor(key, date)?.censored === true
}
