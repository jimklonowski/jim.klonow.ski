import type { DonationDeferral } from '#shared/utils/accutane'
import { DONATION_DEFERRAL_DAYS, donationDeferral } from '#shared/utils/accutane'
import { diffDays } from '#shared/utils/dates'
import type { Phlebotomy } from '#shared/utils/hematocrit'
import { DEFAULT_DONATION_ML, IRON_MG_PER_ML_BLOOD } from '#shared/utils/hematocrit'
import { loadCycles } from './cycleContext'

// Phlebotomies as AI-prompt context (the ask chat, the labs summary): blood taken out on purpose
// is the one thing that moves hematocrit down fast, and a draw after one must be read as such —
// and each visit costs iron the ferritin line will show. Pronoun-free, like the rest of the prose.
// Only visits on or before `asOf` count, so a summary regenerated for an old draw is honest. The
// block also carries the isotretinoin donation deferral (item 85), visits or not.

/** Every visit on file, oldest first; empty when the table doesn't exist yet. */
export async function loadPhlebotomies(db: D1Database): Promise<Phlebotomy[]> {
  try {
    const { results } = await db.prepare('SELECT * FROM phlebotomies ORDER BY date ASC, id ASC').all()
    return (results ?? []) as unknown as Phlebotomy[]
  }
  catch {
    return []
  }
}

/** How far ahead a course's deferral is worth a line before capsule one. */
const DEFERRAL_HORIZON_DAYS = 60

/**
 * The isotretinoin donation deferral as of `asOf` as a prompt line, or '' (item 85): without it
 * a hematocrit near the act rung reads as "consider donating" in the middle of a course.
 */
export function deferralLine(deferral: DonationDeferral | null, asOf: string): string {
  if (!deferral) return ''
  const rule = `blood banks refuse donors from the first isotretinoin capsule until ${DONATION_DEFERRAL_DAYS} days after the last, so any hematocrit management that needs blood out is a therapeutic phlebotomy on a prescriber's order — never suggest donating in that span`
  if (deferral.active) return `Blood donation is deferred until ${deferral.until}: an isotretinoin course started ${deferral.start}, and ${rule}.`
  if (diffDays(asOf, deferral.start) > DEFERRAL_HORIZON_DAYS) return ''
  return `An isotretinoin course starts ${deferral.start}; from then until ${deferral.until} blood donation is deferred — ${rule}.`
}

export async function phlebotomyContext(db: D1Database, asOf: string): Promise<string> {
  const [all, cycles] = await Promise.all([loadPhlebotomies(db), loadCycles(db)])
  const deferral = deferralLine(donationDeferral(cycles, asOf), asOf)
  const rows = all.filter(p => p.date <= asOf)
  if (!rows.length) return deferral
  const lines = rows.map((p) => {
    const ml = p.ml ?? DEFAULT_DONATION_ML
    const parts = [
      `${p.date}: ${p.kind === 'donation' ? 'blood donation' : 'therapeutic phlebotomy'}, ${ml} mL${p.ml == null ? ' (assumed)' : ''}, about ${Math.round(ml * IRON_MG_PER_ML_BLOOD)} mg iron out`,
      p.pre_hgb != null ? `pre-donation hemoglobin ${p.pre_hgb} g/dL` : null,
      p.notes?.trim() ? `note: ${p.notes.trim()}` : null
    ].filter(Boolean)
    return `- ${parts.join('; ')}`
  })
  const log = `Phlebotomies on file (blood removed on purpose — a hematocrit or hemoglobin that falls right after one fell because of it, not because the protocol changed, and the lost iron shows up as lower ferritin):\n${lines.join('\n')}`
  return deferral ? `${log}\n${deferral}` : log
}
