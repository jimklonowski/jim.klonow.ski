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
  // DHT is what a 5-ARI is for (item 65): a low reading on it is the drug, not a deficiency.
  dht: {
    compounds: ['Finasteride', 'Dutasteride'],
    note: 'Starred readings were taken while on a 5-alpha-reductase inhibitor. Finasteride lowers DHT by about two thirds and dutasteride by over 90 %, so a reading under the range on either is the intended effect — compare it with other on-treatment readings, and read a rise toward the pre-treatment level as the drug wearing off or a missed stretch, not as recovery.'
  },
  // Growth hormone speeds the T4 → T3 conversion (item 65): on HGH free T3 drifts up and free T4
  // down with TSH unchanged — an expected pattern, not a thyroid problem.
  t4_free: { compounds: ['HGH', 'Somatropin'], note: 'Starred readings were taken while on growth hormone, which speeds the conversion of T4 to T3 in the tissues: free T4 drifts down and free T3 up while TSH stays put. That pattern on HGH is the drug, not a failing thyroid — compare on-treatment readings with each other, and only read a low free T4 as thyroid trouble if TSH is rising with it.' },
  t3_free: { compounds: ['HGH', 'Somatropin'], note: 'Starred readings were taken while on growth hormone, which speeds the conversion of T4 to T3: free T3 sits high-normal or above while TSH stays put. That is the expected pattern on HGH rather than hyperthyroidism — read it with free T4 and TSH, and compare on-treatment readings with each other.' },
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
  // immunoassay) is paired with the Jason Health ultrasensitive LC/MS/MS add-on. Since item 65
  // the add-on has its own key (estradiol_sensitive) and the extractor files it there; the two
  // draws before that were split by server/database/fix-estradiol-assays-2026-11-10.sql. These
  // notes say the pair exists, so neither card's reader mistakes one series for the other.
  estradiol: [
    {
      date: '2026-08-15',
      note: 'Standard immunoassay estradiol from the Whoop Advanced Labs panel. The same sample was also run by ultrasensitive LC/MS/MS (106), which is on the Estradiol (sensitive) card — the two assays are never compared with each other.'
    },
    {
      date: '2026-10-17',
      note: 'Standard immunoassay estradiol from the Whoop Advanced Labs panel. The same sample was also run by ultrasensitive LC/MS/MS (126), on the Estradiol (sensitive) card; that series is the one to act on, and the two are never compared with each other.'
    }
  ],
  estradiol_sensitive: [
    {
      date: '2026-08-15',
      note: 'Ultrasensitive LC/MS/MS estradiol (Quest order code 30289), a same-day add-on. The panel\'s standard immunoassay on the same sample read 85 (on the Estradiol card); compare this value only with other ultrasensitive readings.'
    },
    {
      date: '2026-10-17',
      note: 'Ultrasensitive LC/MS/MS estradiol, a same-day add-on. Against the ultrasensitive 106 of 2026-08-15 it is a rise of about 20 %. The panel\'s standard immunoassay on the same sample read 157 (on the Estradiol card) and must never be set against this series.'
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
