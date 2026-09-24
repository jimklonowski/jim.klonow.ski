// Vaccinations as AI-prompt context. Pronoun-free, like the rest of the prompt prose.
import { diffDays } from '#shared/utils/dates'
import type { Vaccination } from '#shared/utils/vaccines'
import { VACCINE_EFFECT_DAYS, recentVaccinations, vaccineCoverage, vaccineFamily } from '#shared/utils/vaccines'

// Vaccinations as they bear on `asOf`. Shots within VACCINE_EFFECT_DAYS get the acute-response
// caveat (vitals for a few days, acute-phase blood markers for a couple of weeks); scope 'all'
// (the ask-the-data chat) adds the whole immunization record with next-due dates, so "when was
// my last tetanus shot?" has an answer. Same asOf / try-catch contract as supplementContext.
export async function vaccineContext(db: D1Database, asOf: string, scope: 'recent' | 'all' = 'recent'): Promise<string> {
  let rows: Vaccination[]
  try {
    const { results } = await db.prepare(
      'SELECT date, vaccine, product, notes FROM vaccinations WHERE date <= ?1 ORDER BY date ASC'
    ).bind(asOf).all()
    rows = (results ?? []) as unknown as Vaccination[]
  }
  catch {
    return ''
  }
  if (!rows.length) return ''

  const paragraphs: string[] = []

  const recent = recentVaccinations(rows, asOf)
  if (recent.length) {
    const byDate = new Map<string, Vaccination[]>()
    for (const r of recent) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])
    const entries = [...byDate].map(([date, list]) => {
      const ago = diffDays(date, asOf)
      const when = ago === 0 ? 'the same day' : `${ago} day${ago === 1 ? '' : 's'} earlier`
      const shots = list.map(r => r.product ? `${r.vaccine} (${r.product})` : r.vaccine).join(', ')
      // Three shots from one visit usually share one note — say it once.
      const notes = [...new Set(list.map(r => r.notes?.trim()).filter(Boolean))]
      return `${date} (${when}): ${shots}${notes.length ? ` — ${notes.join('; ')}` : ''}`
    })
    paragraphs.push(`Recent vaccinations (within ${VACCINE_EFFECT_DAYS} days of ${asOf}): ${entries.join('; ')}. A vaccine triggers a deliberate, short-lived immune response: for one to three days afterwards expect lower HRV, a higher resting heart rate, dented recovery and sleep scores, and possibly soreness or a low-grade fever — attribute vitals in that window to the shots before anything in the protocol, and say so plainly. On bloodwork drawn within about two weeks of a shot, acute-phase markers can read transiently high — white blood cells, CRP, ESR, and ferritin (so a ferritin bump here is not evidence of iron repletion) — weigh recency before calling such a shift a trend. A vaccination dated the same day as a draw only bears on that draw if it preceded the blood collection; the notes say which.`)
  }

  if (scope === 'all') {
    const datesByFamily = new Map<string, string[]>()
    for (const r of rows) {
      const key = vaccineFamily(r)
      datesByFamily.set(key, [...(datesByFamily.get(key) ?? []), r.product ? `${r.date} (${r.product})` : r.date])
    }
    const lines = vaccineCoverage(rows, asOf).map((c) => {
      const due = c.nextDue
        ? c.status === 'overdue' ? `booster overdue since ${c.nextDue}` : `next booster due ~${c.nextDue}`
        : 'no routine booster interval'
      return `- ${c.label}: ${(datesByFamily.get(c.family) ?? []).join(', ')} — ${due}`
    })
    paragraphs.push(`Immunization record (every dose on file, oldest first per vaccine; a vaccine with no entry has no recorded date, which is not the same as never having had it):\n${lines.join('\n')}`)
  }

  return paragraphs.join('\n\n')
}
