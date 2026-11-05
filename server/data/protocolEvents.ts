import type { ProtocolEvent, ProtocolGoal } from '#shared/utils/protocolEvents'

// Dated one-off events for the AI prompts: things the data streams can't explain on their own —
// travel, a draw-day deviation, an illness. Hand-maintained like the protocol schedule once was,
// but each entry is dated and ages out of the prompts by itself (eventContext), so the list only
// ever grows; never prune an entry to "fix" a prompt. Each note says how to READ the data around
// it, not just what happened — the model sees the same dose log and vitals and would otherwise
// narrate the gap as a lapse. Pronoun-free, like the rest of the prompt prose.
//
// Server-side on purpose (audit #43 item 48): these notes are personal context in plain prose,
// and anything under app/ or shared/ that a page imports ends up in a public JavaScript chunk.
// The charts get only {from, to, label} (eventBands) through /api/labs/notes.

export const PROTOCOL_EVENTS: ProtocolEvent[] = [
  {
    from: '2026-09-05',
    to: '2026-09-07',
    label: 'Labor Day travel',
    note: 'Labor Day weekend travel, Sat 2026-09-05 through Mon 2026-09-07. The trip — not a protocol change — disrupted dosing: HGH was missed on 09-06 and 09-07, the Sunday hCG dose (09-06) was skipped, and the Monday testosterone injection went in around 12:45 on 09-07 instead of the usual ~04:15 slot (it is logged at its actual time). Read the gap as travel, never as a stop, a taper, or an adherence trend, and mention it once rather than as a recurring headline. Modeled HGH exposure sits a little under steady state for a few days afterwards, so IGF-1 on a draw within the following week may read somewhat below its usual level.'
  },
  {
    from: '2026-09-09',
    // The draw itself is only news for a couple of days. The labs summary for this date always
    // sees the note regardless, because that prompt's asOf IS the draw date.
    relevanceDays: 3,
    note: 'Bloodwork was drawn 2026-09-09 at about 07:50. The morning oral stack — finasteride and iron included — was deliberately held until after the draw, so none of that day\'s orals were on board in the sample; this matters most for serum iron, which a same-morning iron dose would inflate, and marginally for DHT. COVID-19, influenza, and tetanus vaccines followed at about 08:30 — after the blood was taken, so they cannot have influenced this draw\'s results (see the vaccination context for the days after). Total testosterone on this panel was run by immunoassay rather than LC/MS-MS, and that assay reports only as high as 1500 ng/dL: the reported 1500 is a censored ceiling meaning "at least 1500", not a measured value, and the panel carried its own 264-916 ng/dL reference range rather than the usual one. Never read it as a fall from the 2211 measured by LC/MS-MS on 2026-08-15, never compute a delta against it, and never cite it as evidence for or against the effect of the testosterone dose reduction.'
  },
  {
    from: '2026-09-18',
    // Adjust `to` to the actual last day — the run is 7 to 10 days and 09-27 is the 10-day end.
    // 30 days (rather than the default 21) so the 2026-10-17 labs summary still sees this note
    // even if the protocol is cut short at 7 days; that draw's iron panel is unreadable without it.
    to: '2026-09-27',
    relevanceDays: 30,
    note: 'Deliberate short iron-loading protocol, 2026-09-18 through about 2026-09-27: 75 mg iron bisglycinate three times a day at roughly 08:00, 14:00, and 20:00, about 225 mg/day elemental, replacing the standing 50 mg once-daily iron supplement for the duration. The goal is the opposite of ordinary iron repletion. An oral dose above 60 mg raises hepcidin for about 24 hours and blunts absorption of any later dose, so splitting the dose deliberately holds hepcidin high, which traps iron recycled from senescent red cells in storage instead of releasing it into erythropoiesis. Read this as a bounded experiment aimed at raising ferritin from a low baseline, never as a permanent supplement change, a dosing error, or a sign of iron-deficiency treatment as usual. Vitamin D, vitamin C, alcohol, and intense sun or tanning bed exposure are all held for the duration because each lowers hepcidin and would work against the protocol; those gaps are part of the plan and must never be reported as missed doses, a stopped supplement, or an adherence lapse. Some GI upset is expected at this dose and is not a new symptom to investigate. Hematocrit and hemoglobin are NOT expected to fall: red cell mass turns over at only about 1 percent per day, so a ten-day intervention cannot meaningfully reduce it, and flat counts alongside a higher ferritin is the intended result rather than a disappointment. Any serum iron, transferrin saturation, or ferritin measured during the protocol or within roughly a week after reflects an acute iron load and not a steady-state iron store, so treat such a value as inflated and say so. The baseline to compare against is the 2026-08-15 panel: ferritin 16 ng/mL, saturation 17 percent, TIBC 330 mcg/dL, serum iron 56 mcg/dL.'
  },
  {
    from: '2026-11-03',
    // The lead-up only: once the course is running, the isotretinoin row in the protocol schedule
    // (and the lipid/liver caveats keyed to it in server/data/markerCaveats.ts) carry the context.
    relevanceDays: 45,
    note: 'Body (truncal) acne on the chest, shoulders and back kept worsening through the autumn despite adapalene 0.1% gel from mid-September and a 4% benzoyl peroxide wash from 2026-10-12, so on 2026-11-03 a telehealth dermatology service (Clear Health) prescribed oral isotretinoin (Accutane), starting at 40 mg a day with the dose planned to rise over the course; the first 30 capsules shipped that day and the course starts within a few days of it. The exact start date is the isotretinoin entry in the protocol schedule — until that entry exists the course has not begun. Isotretinoin is a LOGGED compound: every capsule is in the dose log at its actual milligrams, and the running total of those doses is the course progress. The prescriber plans the course to a cumulative dose of 150 to 220 mg/kg (about 11,600 to 17,000 mg at 77 kg), so a missed day lengthens the course rather than lowering the total, and a dose increase shortens it. At the start, every topical acne agent is discontinued on purpose: tretinoin, azelaic acid, benzoyl peroxide and adapalene all stop, because isotretinoin already thins and dries the skin and the topicals only add irritation. Read those stops as part of the plan, never as a lapse, a cost cut, or giving up on the skin. Pure Encapsulations Lipid Support Complex, already on hand, may be started alongside. Truncal acne on a testosterone plus hCG protocol is an androgen-load signal; isotretinoin shrinks the sebaceous glands and treats that symptom without changing the load, so say so rather than reading clearer skin as a lower androgen exposure. What to expect in the data once the course runs: triglycerides and LDL up and HDL down within the first 4 to 8 weeks, ALT and AST mildly up, CK high after hard training — all expected, dose-dependent, reversible drug effects to attribute to isotretinoin before diet or the anabolic question, and none of them a clean baseline for the Primobolan decision; dry lips, skin, eyes and nose, nosebleeds, sun sensitivity and muscle or joint aches are expected too, while a lower mood or changed sleep is worth naming rather than dismissing. No vitamin A supplements, no tetracyclines, and no blood donation during the course or for a month after it.'
  }
]

// What the protocol is currently FOR: the targets a new draw is read against and what gates the
// next decision. Dated like the events, but a goal holds until the next one is stated rather than
// aging out, so a summary regenerated for an old draw sees the goal of its day — or none, before
// the first was written down. Append a new entry when the goals change; never edit history.
export const PROTOCOL_GOALS: ProtocolGoal[] = [
  {
    from: '2026-10-23',
    note: 'Bring estradiol down a little, bring total and free testosterone down with it, and see hematocrit fall. All three gate the Primobolan run pencilled in for spring 2027, hematocrit above all: that decision waits until hematocrit is seen falling, not merely holding. Background: the testosterone cut of 2026-08-24 (200 to 150 mg/week) was expected to lower estradiol, yet ultrasensitive LC/MS estradiol ROSE from 106 to 126 pg/mL between the 2026-08-15 and 2026-10-17 draws while total and free testosterone fell over the same span — so the likelier driver is the hCG raise of 2026-09-08 (250 to 300 IU, three times a week), and hCG was cut to 250 IU twice a week from 2026-10-24 in response. Hematocrit has plateaued at 51.7 on both 2026-09-09 and 2026-10-17, about eight weeks after the testosterone cut: flat, not yet falling, which is consistent with red cells turning over on a roughly 120-day cycle — the cut\'s full effect is not expected to show before about late December 2026. Read each new draw against these goals: say whether estradiol, total/free testosterone and hematocrit each moved toward or away from them, by how much, and whether enough time has passed since the relevant protocol change for the move to mean anything.'
  }
]
