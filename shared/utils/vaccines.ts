// Vaccine catalogue + booster math. Shared (app + server) because /journal/vaccines renders the
// coverage table from it and the AI prompt context (server/utils/vaccineContext.ts)
// reports the same "last dose / next due" facts.
//
// The log exists because a routine "when was your last tetanus shot?" had no answer — so the
// unit of value here is the per-family coverage row, not the individual dose.
// Explicit extension: the tests import this file straight into Node's native type-stripping,
// whose ESM resolver doesn't guess extensions (same as stockRunway.ts / cycleSignals.ts).
import { diffDays, shiftDays } from './dates.ts'

export interface Vaccination {
  id?: number
  /** YYYY-MM-DD the dose was given. */
  date: string
  /** Freehand, usually one of KNOWN_VACCINES[].name via autocomplete. */
  vaccine: string
  /** Brand/formulation, e.g. "Spikevax 2026-27", "Boostrix". */
  product?: string | null
  /** Shown to the AI too — e.g. "given after the 07:50 blood draw". */
  notes?: string | null
  created_at?: string
}

export interface VaccineInfo {
  /** Display name — the autocomplete item, and what a row stores when picked. */
  name: string
  /** Booster family: Td and Tdap both reset the tetanus clock, so they share one. */
  family: string
  /** Lower-cased words/phrases (matched on word boundaries) that map freehand text here. */
  match: string[]
  /** Routine adult booster interval. null = a series, one-time, or no fixed schedule. */
  intervalYears: number | null
  hint?: string
}

export const KNOWN_VACCINES: VaccineInfo[] = [
  { name: 'Influenza (flu)', family: 'influenza', match: ['flu', 'influenza', 'fluzone', 'flublok', 'fluad'], intervalYears: 1, hint: 'each fall' },
  { name: 'COVID-19', family: 'covid', match: ['covid', 'covid-19', 'sars-cov-2', 'spikevax', 'comirnaty', 'novavax', 'nuvaxovid'], intervalYears: 1, hint: 'updated formula each fall' },
  { name: 'Tetanus (Td/Tdap)', family: 'tetanus', match: ['tetanus', 'tdap', 'td', 'boostrix', 'adacel', 'tenivac', 'tdvax'], intervalYears: 10, hint: 'booster every 10 years' },
  { name: 'Shingles (Shingrix)', family: 'shingles', match: ['shingles', 'shingrix', 'zoster'], intervalYears: null, hint: '2-dose series' },
  { name: 'Pneumococcal', family: 'pneumococcal', match: ['pneumococcal', 'pneumonia', 'prevnar', 'pneumovax', 'capvaxive'], intervalYears: null },
  { name: 'RSV', family: 'rsv', match: ['rsv', 'arexvy', 'abrysvo', 'mresvia'], intervalYears: null },
  { name: 'Hepatitis A', family: 'hep-a', match: ['hep a', 'hepatitis a', 'havrix', 'vaqta'], intervalYears: null, hint: '2-dose series' },
  { name: 'Hepatitis B', family: 'hep-b', match: ['hep b', 'hepatitis b', 'engerix', 'heplisav', 'recombivax'], intervalYears: null, hint: '2–3 dose series' },
  { name: 'HPV', family: 'hpv', match: ['hpv', 'gardasil'], intervalYears: null },
  { name: 'MMR', family: 'mmr', match: ['mmr', 'measles', 'mumps', 'rubella'], intervalYears: null },
  { name: 'Meningococcal', family: 'meningococcal', match: ['meningococcal', 'meningitis', 'menactra', 'menveo', 'menquadfi', 'bexsero', 'trumenba'], intervalYears: null },
  { name: 'Typhoid', family: 'typhoid', match: ['typhoid', 'typhim'], intervalYears: 2, hint: 'injectable; travel' },
  { name: 'Yellow fever', family: 'yellow-fever', match: ['yellow fever', 'yf-vax'], intervalYears: null, hint: 'one dose, lifetime for most' },
  { name: 'Rabies', family: 'rabies', match: ['rabies', 'imovax', 'rabavert'], intervalYears: null }
]

export const VACCINE_NAMES = KNOWN_VACCINES.map(v => v.name)

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The catalogue entry a freehand vaccine (or product) name refers to, if any. */
export function vaccineInfo(text: string | null | undefined): VaccineInfo | null {
  const hay = (text ?? '').toLowerCase()
  if (!hay) return null
  const exact = KNOWN_VACCINES.find(v => v.name.toLowerCase() === hay)
  if (exact) return exact
  return KNOWN_VACCINES.find(v => v.match.some(m => new RegExp(`\\b${escapeRegExp(m)}\\b`).test(hay))) ?? null
}

/** Family key for grouping: the catalogue family, else the freehand name normalized. */
export function vaccineFamily(row: Pick<Vaccination, 'vaccine' | 'product'>): string {
  const info = vaccineInfo(row.vaccine) ?? vaccineInfo(row.product)
  return info?.family ?? row.vaccine.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** date + n calendar years, YYYY-MM-DD. Feb 29 rolls forward to Mar 1 in a non-leap year. */
export function addYears(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + n)
  return d.toISOString().slice(0, 10)
}

export type CoverageStatus = 'current' | 'due' | 'overdue' | 'unscheduled'

export interface VaccineCoverage {
  family: string
  /** Catalogue name when recognized, else the freehand text as written on the latest dose. */
  label: string
  lastDate: string
  doses: number
  intervalYears: number | null
  /** Last dose + interval; null when the family has no routine booster interval. */
  nextDue: string | null
  status: CoverageStatus
  hint?: string
}

// "Due" starts this far ahead of the computed date — flu/COVID shots are seasonal and a
// tetanus booster's exact month never matters, so a soft lead-in beats a hard deadline.
export const DUE_SOON_DAYS = 60

const STATUS_ORDER: Record<CoverageStatus, number> = { overdue: 0, due: 1, current: 2, unscheduled: 3 }

/**
 * One row per booster family as of `asOf`: latest dose, dose count, and where the next one
 * falls. Doses dated after asOf are ignored (the page and the prompts both ask "as of today").
 * Sorted by urgency, then by next-due date.
 */
export function vaccineCoverage(rows: Vaccination[], asOf: string): VaccineCoverage[] {
  const byFamily = new Map<string, Vaccination[]>()
  for (const row of rows) {
    if (row.date > asOf) continue
    const key = vaccineFamily(row)
    byFamily.set(key, [...(byFamily.get(key) ?? []), row])
  }

  const out: VaccineCoverage[] = []
  for (const [family, doses] of byFamily) {
    const latest = [...doses].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!
    const info = vaccineInfo(latest.vaccine) ?? vaccineInfo(latest.product)
    const intervalYears = info?.intervalYears ?? null
    const nextDue = intervalYears ? addYears(latest.date, intervalYears) : null
    let status: CoverageStatus = 'unscheduled'
    if (nextDue) {
      const daysOut = diffDays(asOf, nextDue)
      status = daysOut < 0 ? 'overdue' : daysOut <= DUE_SOON_DAYS ? 'due' : 'current'
    }
    out.push({
      family,
      label: info?.name ?? latest.vaccine.trim(),
      lastDate: latest.date,
      doses: doses.length,
      intervalYears,
      nextDue,
      status,
      hint: info?.hint
    })
  }

  return out.sort((a, b) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || (a.nextDue ?? '9999').localeCompare(b.nextDue ?? '9999')
    || b.lastDate.localeCompare(a.lastDate)
  )
}

// How long a shot stays worth telling the AI about. The acute response (HRV dip, RHR bump,
// dented recovery) lasts 1–3 days, but acute-phase blood markers — WBC, CRP, and ferritin,
// which is exactly the marker being watched for iron trend — can read high for a couple of
// weeks, so a draw inside this window needs the caveat.
export const VACCINE_EFFECT_DAYS = 21

/** Doses given within VACCINE_EFFECT_DAYS before (and including) asOf, oldest first. */
export function recentVaccinations(rows: Vaccination[], asOf: string, windowDays = VACCINE_EFFECT_DAYS): Vaccination[] {
  const since = shiftDays(asOf, -windowDays)
  return rows
    .filter(r => r.date <= asOf && r.date >= since)
    .sort((a, b) => a.date.localeCompare(b.date))
}
