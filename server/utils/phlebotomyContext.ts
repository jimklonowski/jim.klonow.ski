import type { Phlebotomy } from '#shared/utils/hematocrit'
import { DEFAULT_DONATION_ML, IRON_MG_PER_ML_BLOOD } from '#shared/utils/hematocrit'

// Phlebotomies as AI-prompt context (the ask chat, the labs summary): blood taken out on purpose
// is the one thing that moves hematocrit down fast, and a draw after one must be read as such —
// and each visit costs iron the ferritin line will show. Pronoun-free, like the rest of the prose.
// Only visits on or before `asOf` count, so a summary regenerated for an old draw is honest.

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

export async function phlebotomyContext(db: D1Database, asOf: string): Promise<string> {
  const rows = (await loadPhlebotomies(db)).filter(p => p.date <= asOf)
  if (!rows.length) return ''
  const lines = rows.map((p) => {
    const ml = p.ml ?? DEFAULT_DONATION_ML
    const parts = [
      `${p.date}: ${p.kind === 'donation' ? 'blood donation' : 'therapeutic phlebotomy'}, ${ml} mL${p.ml == null ? ' (assumed)' : ''}, about ${Math.round(ml * IRON_MG_PER_ML_BLOOD)} mg iron out`,
      p.pre_hgb != null ? `pre-donation hemoglobin ${p.pre_hgb} g/dL` : null,
      p.notes?.trim() ? `note: ${p.notes.trim()}` : null
    ].filter(Boolean)
    return `- ${parts.join('; ')}`
  })
  return `Phlebotomies on file (blood removed on purpose — a hematocrit or hemoglobin that falls right after one fell because of it, not because the protocol changed, and the lost iron shows up as lower ferritin):\n${lines.join('\n')}`
}
