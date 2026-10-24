import { goalContext } from '#shared/utils/protocolEvents'
import { protocolSchedule } from '#shared/utils/protocolProse'

// The two long-form summary prompts — the labs trend summary and the DEXA body-composition
// summary — out of their handlers (audit #42 item 42), so the prompt text lives beside the
// digest's (digestPrompts.ts) and a wording change is one diff in one place. The extraction
// kept the text byte-for-byte; the 2026-10-23 revision of the labs prompt (reading notes,
// censored values, a word budget, trend wording) changed it on purpose, so summaries stored
// before then carry the older hash and read as written under the older wording — correct.

export interface LabsSummaryInputs {
  date: string
  fasting: boolean
  /** The comparison window, oldest first, the new draw last. */
  draws: Array<{ date: string, fasting: boolean }>
  /** protocolContext's lines wrapped in newlines, or '' (the handler builds the block). */
  protocolBlock: string
  supplementBlock: string
  cycleBlock: string
  vaccineBlock: string
  eventBlock: string
  plannedBlock: string
  /** One "Label [unit, ref]: date: value -> NEW date: value" line per marker; a daggered value (†) has a reading note. */
  markerLines: string[]
  /** One "† Label on date: note" line per daggered reading (READING_NOTES), or []. */
  readingNotes: string[]
  /** The qualitative results block, already framed, or ''. */
  qualitativeBlock: string
}

export function labsSummaryPrompt(i: LabsSummaryInputs): string {
  const goals = goalContext(i.date)
  return `You are writing a trend summary for a personal bloodwork dashboard. The reader is the person whose labs these are — address them as "you". They track their own biomarkers closely and understand them well. They run a self-directed hormone protocol whose core is testosterone (TRT), HGH, and hCG, with ancillary peptides rotating around that core (the schedule below says what was running as of this draw) — and they are weighing adding a mild anabolic (Primobolan or Anavar) for lean-mass goals — so markers that gate that decision (lipids, especially HDL; liver enzymes; hematocrit/hemoglobin; iron/ferritin; blood pressure proxies) deserve extra attention when present. They are not currently taking an aromatase inhibitor but keep Anastrozole on hand from their TRT clinic for symptomatic use; estradiol has been climbing and may read over 100 pg/mL on new draws. Treat elevated estradiol as a known, watched issue: quantify the trend against prior draws, name the specific symptoms and risks worth monitoring at that level, and frame the on-hand Anastrozole as the discussion point for symptom-driven use — not something to start reflexively.

${protocolSchedule(i.date)}
${goals ? `\n${goals}\n` : ''}${i.supplementBlock ? `\n${i.supplementBlock}\n` : ''}${i.cycleBlock ? `\n${i.cycleBlock}\n` : ''}${i.vaccineBlock ? `\n${i.vaccineBlock}\n` : ''}${i.eventBlock ? `\n${i.eventBlock}\n` : ''}${i.plannedBlock ? `\n${i.plannedBlock}\n` : ''}
The oral stack above matters here: supplements move blood markers (iron dosing moves ferritin/iron; soluble fiber, omega-3s, and CoQ10 bear on lipids; finasteride and dutasteride lower DHT and roughly halve PSA once 6–12 months in, so double an on-treatment PSA before comparing it with pre-treatment draws; turmeric inhibits iron absorption; ashwagandha touches thyroid and cortisol; berberine/TUDCA-style liver support moves liver enzymes and lipids), and recent starts, stops, and dose changes are dated above — check the stack before attributing a marker shift to the injectable protocol alone.

New draw: ${i.date} (${i.fasting ? 'fasting' : 'non-fasting'})
Draws included for comparison: ${i.draws.map(d => `${d.date}${d.fasting ? ' (fasting)' : ' (non-fasting)'}`).join(', ')}
${i.protocolBlock}
Marker history (oldest -> newest, "NEW" marks the new draw; a dagger † after a value means that reading has a note below):
${i.markerLines.join('\n')}
${i.readingNotes.length ? `\nReading notes — caveats that belong to one reading (a different assay, a different lab, a value censored at the instrument limit). They override whatever the bare numbers suggest: when a note says a value is not comparable with its neighbours, do not compute a change against it, and say in a clause why not:\n${i.readingNotes.join('\n')}\n` : ''}
A value the lab reported as "<X" or ">X" is stored as X. A reading sitting exactly on an assay floor or ceiling (LH 0.2 and FSH 0.7 under suppressive therapy, a total testosterone of exactly 1500 on an immunoassay panel) is therefore censored, not measured: read it as "below the floor" or "at least the ceiling", never trend it, and never compute a change from it.
${i.qualitativeBlock}
Cover these, in order of importance:
1. The most significant changes versus the previous draw, with specific numbers and % change.
2. Any values in the new draw outside their reference range.
3. Notable trends across multiple draws (steady climbs or declines). When you call something a trend, give the whole series across the draws that measured it (49 -> 56 -> 55 -> 59), not just its two endpoints — a flat series that happens to start lower is not a climb. Where the timing lines up with a protocol change above, say so plainly and explain the likely physiological mechanism in a sentence (e.g. testosterone stimulates erythropoiesis, so red cell production rises and draws down ferritin/iron stores) — frame it as the likely driver, not a certainty.
4. For each marker that is out of range or trending in a concerning direction, give 2-3 concrete steps to improve it (specific dietary changes, supplementation with typical doses and timing, spacing interfering substances, blood donation where relevant, and when to retest to confirm the trend). Skip this for markers that are stable and in range.

When a hormone-sensitive marker (total/free testosterone, estradiol, hematocrit) moved versus prior draws, weigh the draw-timing lines above before calling it a real change — near-peak vs near-trough sampling can explain an apparent shift on an unchanged protocol, and you should say so when it does. Those lines are an estimate from the dose log: call them "the dose-timing estimate", never "the model".

Be factual, specific, and concise, and keep the whole thing to roughly 500-600 words — the dashboard shows it above the draw, so it has to be read in a few minutes, not studied. Points 1-3 are short prose paragraphs. Point 4 may put its steps one per line, numbered, under a one-line label naming the marker; that is the only list allowed. Write dates in prose as "Aug 24", not "2026-08-24". If everything is stable and in range, say so briefly — do not manufacture concerns. No greeting, no closing, no medical-advice disclaimers or "consult your doctor" boilerplate. Plain text only — no markdown, no headers, no bullet characters.`
}

export interface DexaSummaryInputs {
  date: string
  /** protocolContext's lines wrapped in newlines, or '' (the handler builds the block). */
  protocolBlock: string
  supplementBlock: string
  cycleBlock: string
  eventBlock: string
  /** describeScan's lines for every scan in the window, with each scan's daily-readings line. */
  scanBlock: string[]
  trainingBlock: string
}

export function dexaSummaryPrompt(i: DexaSummaryInputs): string {
  const goals = goalContext(i.date)
  return `You are writing a body-composition summary for a personal health dashboard. The reader is the person who was scanned — address them as "you". They lift seriously, track their body closely and understand DEXA output. They run a self-directed hormone protocol whose core is testosterone (TRT), HGH and hCG, with ancillary peptides rotating around that core (the schedule below is what was running as of this scan), and they are in a lean-mass phase: adding muscle — arms and chest especially — while holding body fat in the fit range. Treat regional lean changes and left/right symmetry as training signals worth a sentence each.

${protocolSchedule(i.date)}
${goals ? `\n${goals}\n` : ''}${i.protocolBlock}${i.supplementBlock ? `\n${i.supplementBlock}\n` : ''}${i.cycleBlock ? `\n${i.cycleBlock}\n` : ''}${i.eventBlock ? `\n${i.eventBlock}\n` : ''}
DEXA scans on file (oldest -> newest; "NEW" marks the new scan; masses in lbs). "Scale weight" is the clinic-typed figure from the report header and can lag — the DEXA total is the measured one:
${i.scanBlock.join('\n')}

${i.trainingBlock}

Reference points from the scan provider: VAT volume under 52 in³ is ideal, 52–112 elevated, above that high; an A/G ratio under 1.0 is optimal; a total-body BMD T-score above -1.0 is normal and -1.0 to -2.5 is osteopenia; typical left/right lean imbalance is up to 0.5 lbs for arms and 1.5 lbs for legs. Total-body BMD is not the hip/spine DEXA used for osteoporosis screening — say so if you comment on bone.

Write 3-4 short paragraphs, in order of importance:
1. The headline change versus the previous scan, with specific numbers and % change: fat mass against lean mass, body fat %, and where the lean went by region (arms, legs, trunk). If this is the first scan, describe where the baseline sits instead.
2. Fat distribution and visceral fat — android vs gynoid, A/G ratio, VAT — and what those levels mean for metabolic risk.
3. Symmetry and bone: the left/right lean differences against the typical ranges above and what to do about them in training; bone density context in a sentence or two.
4. Attribution and next steps: how much of any lean change is plausibly tissue rather than water and glycogen (creatine, carbohydrate, HGH-related fluid), how the DEXA squares with the scale and Withings readings around each scan, what in the protocol and training context above most likely drove the change, and what to watch or change before the next scan — including when to rescan.

Be factual, specific and concise, and keep the whole thing to roughly 350 words — the dashboard shows it above the scan, so it has to be read in a minute, not studied. If little changed, say so briefly — do not manufacture concerns. No greeting, no closing, no medical-advice disclaimers or "consult your doctor" boilerplate. Plain text only — no markdown, no headers, no bullet characters.`
}
