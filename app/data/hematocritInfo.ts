// The hematocrit control panel's dossier (/labs/hematocrit) — the compound page's DOSSIER block
// for a marker instead of a compound: what the number is, why the protocol moves it, and the
// rules of thumb the panel's arithmetic rests on (shared/utils/hematocrit.ts holds the numbers).
import { BIOMARKERS } from '~/data/biomarkers'
import {
  DEFAULT_DONATION_ML, HCT_LADDER, IRON_MG_PER_ML_BLOOD, ORAL_IRON_ABSORBED, RBC_TURNOVER_DAYS
} from '#shared/utils/hematocrit'

export interface HematocritDossier {
  summary: string
  entries: Array<{ label: string, text: string, note?: string }>
  caution: string
}

const hct = BIOMARKERS.hematocrit!
const ladderLine = HCT_LADDER.map(r => `${r.at} ${r.label}`).join(' · ')
const donationIronMg = Math.round(DEFAULT_DONATION_ML * IRON_MG_PER_ML_BLOOD)
const absorbedPct = Math.round(ORAL_IRON_ABSORBED * 100)

export const HEMATOCRIT_DOSSIER: HematocritDossier = {
  summary: `${hct.description} On TRT it climbs because testosterone drives erythropoietin and suppresses hepcidin, so more iron reaches the marrow — a rising hematocrit is the most common reason a testosterone dose gets cut.`,
  entries: [
    {
      label: 'Reference range',
      text: `${hct.refMin}–${hct.refMax} ${hct.unit} on the lab's panel.`,
      note: `The lab flags above ${hct.refMax}; the clinic starts to worry from ${HCT_LADDER[0]!.at}.`
    },
    {
      label: 'The ladder',
      text: `${ladderLine}. Each rung names the one thing it calls for, so the number never has to be re-argued on draw day.`,
      note: `${HCT_LADDER.at(-1)!.at} is the viscosity and clot-risk line — blood comes out and the dose stops until a draw reads under ${HCT_LADDER[1]!.at}.`
    },
    {
      label: 'Turnover window',
      text: `Red cells live about ${RBC_TURNOVER_DAYS} days, so a dose change takes a full cycle to show its whole effect. A draw inside that window is transitional: flat or still drifting up is the expected reading, not the change failing.`
    },
    {
      label: 'Phlebotomy',
      text: `A whole-blood donation takes about ${DEFAULT_DONATION_ML} mL and carries roughly ${donationIronMg} mg of iron with it; hematocrit typically drops a few points for some weeks and the next CBC shows what it bought.`,
      note: 'Donate too often and ferritin pays the bill — the iron ledger below the chart keeps that score.'
    },
    {
      label: 'Iron arithmetic',
      text: `Each mL of blood out carries ~${IRON_MG_PER_ML_BLOOD} mg of iron. A replete adult absorbs about ${absorbedPct} % of an oral dose, so 50 mg elemental a day puts back roughly ${Math.round(50 * ORAL_IRON_ABSORBED * 10) / 10} mg.`,
      note: 'Both sides are estimates; ferritin is the measured answer.'
    },
    {
      label: 'Confounders',
      text: 'Dehydration, a fasted morning draw, altitude and untreated sleep apnea all push the reading up. Drink before a draw and compare like with like before acting on a single point.'
    }
  ],
  caution: `Above ${HCT_LADDER.at(-1)!.at} % the blood thickens and clot risk rises — that rung is a stop, not a watch. Act on the clinic's read, not this page's.`
}
