// Medications on the protocol that change how a lab marker reads. A flagged marker gets an
// asterisk and an "on <compound>" badge on its card, and each affected reading in the detail
// modal is starred — but only for draws taken while the compound was on the schedule, which
// PROTOCOL_RULES already dates, so pre-treatment readings stay unflagged and comparable.
// (The demo persona's labs carry none of these markers, so nothing shows in demo sessions.)
import type { ProtocolRule } from '#shared/utils/protocolRules'
import { PROTOCOL_RULES, ruleActiveOn } from '#shared/utils/protocolRules'

export interface MarkerCaveat {
  /** PROTOCOL_RULES compound names that skew this marker. */
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
export function caveatCompoundOn(key: string, date: string, rules: ProtocolRule[] = PROTOCOL_RULES): string | null {
  const caveat = MARKER_CAVEATS[key]
  if (!caveat) return null
  return rules.find(r => caveat.compounds.includes(r.compound) && ruleActiveOn(r, date))?.compound ?? null
}
